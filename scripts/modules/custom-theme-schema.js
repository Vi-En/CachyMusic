/**
 * Versioned Custom Theme Schema, Strict Sanitizer, Built-In Cloner, and JSON Import/Export.
 * Zero executable CSS/HTML or external network URLs allowed.
 */
import { VALID_THEME_IDS, normalizeThemeId } from './theme-catalog.js';
import { parseColor, srgbToHex } from './color-contrast.js';
import { VALID_TEXTURE_IDS } from './custom-theme-textures.js';

export const CUSTOM_THEME_SCHEMA_VERSION = 1;
export const CUSTOM_THEME_PREFIX = 'custom:';
export const MAX_CUSTOM_THEME_JSON_BYTES = 3 * 1024 * 1024;

export const FONT_STACK_PRESETS = Object.freeze({
    'system-sans': { label: 'System UI Sans', stack: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' },
    'geometric-sans': { label: 'Geometric Sans', stack: 'Futura, "Century Gothic", "Avenir Next", system-ui, sans-serif' },
    'humanist-sans': { label: 'Humanist Sans', stack: '"Segoe UI", "Noto Sans", "Liberation Sans", system-ui, sans-serif' },
    'editorial-serif': { label: 'Editorial Serif', stack: 'Georgia, "Liberation Serif", "Times New Roman", serif' },
    'slab-serif': { label: 'Classical Serif', stack: '"Palatino Linotype", "Book Antiqua", Palatino, Georgia, serif' },
    'technical-mono': { label: 'Technical Mono', stack: 'ui-monospace, "Cascadia Mono", "SFMono-Regular", Menlo, Consolas, monospace' },
    'condensed-display': { label: 'Condensed Display', stack: '"Arial Narrow", "Roboto Condensed", "Liberation Sans Narrow", sans-serif' },
    'rounded-ui': { label: 'Soft Rounded UI', stack: 'ui-rounded, "Hiragino Maru Gothic ProN", Quicksand, system-ui, sans-serif' }
});

export const BORDER_STYLES = ['solid', 'dashed', 'dotted', 'double', 'none'];
export const GRADIENT_TYPES = ['none', 'linear', 'radial', 'conic'];
export const BG_MODES = ['solid', 'gradient', 'texture', 'image'];
export const BG_FITS = ['cover', 'contain', 'tile', 'center'];
export const BLEND_MODES = ['normal', 'multiply', 'screen', 'overlay', 'soft-light', 'luminosity'];
export const DENSITY_MODES = ['compact', 'comfortable', 'spacious'];
export const SHADOW_LEVELS = ['none', 'subtle', 'soft', 'crisp', 'deep'];
export const HEADING_CASES = ['none', 'uppercase', 'small-caps'];
export const MOTION_PROFILES = ['instant', 'snappy', 'fluid', 'expressive', 'spring', 'reduced'];
export const EASING_PRESETS = Object.freeze({
    linear: 'linear',
    crisp: 'cubic-bezier(0.2, 0.8, 0.25, 1)',
    emphasized: 'cubic-bezier(0.22, 0.7, 0.25, 1)',
    'expo-out': 'cubic-bezier(0.16, 1, 0.3, 1)',
    spring: 'cubic-bezier(0.34, 1.38, 0.64, 1)',
    overshoot: 'cubic-bezier(0.25, 1.45, 0.5, 1)'
});
export const VIEW_TRANSITIONS = ['none', 'crossfade', 'slide-morph', 'scale-zoom', 'depth-lift'];
export const MODAL_ANIMATIONS = ['fade', 'pop', 'sheet', 'bloom'];
export const BUTTON_FEEDBACKS = ['subtle', 'pop', 'crisp', 'none'];
export const TAB_MORPHS = ['instant', 'glide'];
export const AMBIENT_MOTIONS = ['none', 'gradient-drift', 'aura-breathe', 'subtle-parallax'];
export const SHAPE_PRESETS = Object.freeze({
    sharp: { label: 'Sharp', panelRadius: 0, controlRadius: 0, playRadius: 0, thumbRadius: 0, panelBorderStyle: 'solid' },
    instrument: { label: 'Instrument', panelRadius: 6, controlRadius: 4, playRadius: 6, thumbRadius: 2, panelBorderStyle: 'solid' },
    editorial: { label: 'Editorial', panelRadius: 12, controlRadius: 6, playRadius: 50, thumbRadius: 4, panelBorderStyle: 'solid' },
    pill: { label: 'Soft Pill', panelRadius: 20, controlRadius: 14, playRadius: 50, thumbRadius: 8, panelBorderStyle: 'solid' },
    organic: { label: 'Organic Asymmetric', panelRadius: 18, controlRadius: 10, playRadius: 34, thumbRadius: 6, panelBorderStyle: 'solid' }
});

/**
 * Built-in palette templates so users can clone any of the 12 built-in themes cleanly.
 */
export const BUILTIN_THEME_TEMPLATES = Object.freeze({
    default: {
        mode: 'dark', bgCanvas: '#090e14', surface1: '#111a24', surface2: '#192634', surface3: '#223346',
        accent: '#38bdf8', secondary: '#94a3b8', textPrimary: '#f2f6fb', textSecondary: '#cad7e6', textMuted: '#9db1c7',
        textOnAccent: '#04131c', borderControl: '#5c7896', borderSurface: '#2e4156', borderDivider: '#27384b',
        borderFocus: '#7dd3fc', notificationStyle: 'segmented', shapePreset: 'editorial', displayFont: 'geometric-sans'
    },
    nms: {
        mode: 'dark', bgCanvas: '#15080a', surface1: '#230d11', surface2: '#311319', surface3: '#411a22',
        accent: '#ff4264', secondary: '#00e5ff', textPrimary: '#fbf1f3', textSecondary: '#e5cbd0', textMuted: '#cc9fa8',
        textOnAccent: '#140306', borderControl: '#a65061', borderSurface: '#632834', borderDivider: '#4f202a',
        borderFocus: '#ff708a', notificationStyle: 'liquid', shapePreset: 'sharp', displayFont: 'geometric-sans'
    },
    'solar-eclipse': {
        mode: 'dark', bgCanvas: '#0a0b1a', surface1: '#121531', surface2: '#1b2048', surface3: '#252c61',
        accent: '#38d9ff', secondary: '#a855f7', textPrimary: '#f1f4ff', textSecondary: '#c7d2f5', textMuted: '#99abe2',
        textOnAccent: '#03121a', borderControl: '#5768b2', borderSurface: '#2f386b', borderDivider: '#28305a',
        borderFocus: '#7ae7ff', notificationStyle: 'liquid', shapePreset: 'pill', displayFont: 'system-sans'
    },
    'euclid-horizon': {
        mode: 'dark', bgCanvas: '#120e09', surface1: '#211910', surface2: '#2e2317', surface3: '#3c2e1f',
        accent: '#f59e0b', secondary: '#fbbf24', textPrimary: '#fbf5ec', textSecondary: '#e6d8c3', textMuted: '#c5b091',
        textOnAccent: '#191002', borderControl: '#8c6d45', borderSurface: '#523e27', borderDivider: '#443421',
        borderFocus: '#fbbf24', notificationStyle: 'segmented', shapePreset: 'sharp', displayFont: 'system-sans'
    },
    'alien-paradise': {
        mode: 'dark', bgCanvas: '#140912', surface1: '#22101f', surface2: '#30172c', surface3: '#401f3b',
        accent: '#ff4da6', secondary: '#2dd4bf', textPrimary: '#fdf1f8', textSecondary: '#eac7dc', textMuted: '#cfa0be',
        textOnAccent: '#17040e', borderControl: '#965483', borderSurface: '#56294b', borderDivider: '#47213e',
        borderFocus: '#ff85c2', notificationStyle: 'liquid', shapePreset: 'organic', displayFont: 'editorial-serif'
    },
    'abyssal-void': {
        mode: 'dark', bgCanvas: '#06140f', surface1: '#0c231b', surface2: '#133328', surface3: '#1a4436',
        accent: '#10f5a8', secondary: '#0ea5e9', textPrimary: '#effcf7', textSecondary: '#bee6d7', textMuted: '#93c8b4',
        textOnAccent: '#02170f', borderControl: '#468a71', borderSurface: '#215442', borderDivider: '#1b4536',
        borderFocus: '#5cfac4', notificationStyle: 'liquid', shapePreset: 'instrument', displayFont: 'technical-mono'
    },
    dissonance: {
        mode: 'dark', bgCanvas: '#12081c', surface1: '#1e0f2f', surface2: '#2b1642', surface3: '#391e56',
        accent: '#c084fc', secondary: '#f472b6', textPrimary: '#f6f0fd', textSecondary: '#d8c5f2', textMuted: '#b79cda',
        textOnAccent: '#140624', borderControl: '#7e55ad', borderSurface: '#4a2b6e', borderDivider: '#3d245a',
        borderFocus: '#d8b4fe', notificationStyle: 'liquid', shapePreset: 'organic', displayFont: 'system-sans'
    },
    sentinel: {
        mode: 'dark', bgCanvas: '#09111a', surface1: '#121f2e', surface2: '#1b2d42', surface3: '#253d58',
        accent: '#00e5ff', secondary: '#f97316', textPrimary: '#eff6fc', textSecondary: '#c3d5e6', textMuted: '#96b1cc',
        textOnAccent: '#02161a', borderControl: '#557696', borderSurface: '#2b4259', borderDivider: '#24374a',
        borderFocus: '#67e8f9', notificationStyle: 'segmented', shapePreset: 'instrument', displayFont: 'technical-mono'
    },
    'minimalist-light': {
        mode: 'light', bgCanvas: '#f4f3ef', surface1: '#ffffff', surface2: '#e7e5de', surface3: '#dad7ce',
        accent: '#111827', secondary: '#4b5563', textPrimary: '#111318', textSecondary: '#313640', textMuted: '#484f5c',
        textOnAccent: '#ffffff', borderControl: '#71757d', borderSurface: '#b9b7ae', borderDivider: '#c8c5bc',
        borderFocus: '#111827', notificationStyle: 'segmented', shapePreset: 'sharp', displayFont: 'editorial-serif'
    },
    'minimalist-dark': {
        mode: 'dark', bgCanvas: '#080808', surface1: '#171717', surface2: '#232323', surface3: '#303030',
        accent: '#f3f4f6', secondary: '#a1a1aa', textPrimary: '#ffffff', textSecondary: '#d4d4d8', textMuted: '#a6a6ae',
        textOnAccent: '#080808', borderControl: '#73737a', borderSurface: '#38383c', borderDivider: '#2e2e32',
        borderFocus: '#ffffff', notificationStyle: 'segmented', shapePreset: 'sharp', displayFont: 'technical-mono'
    },
    'minimalist-warm': {
        mode: 'light', bgCanvas: '#faf8f5', surface1: '#ffffff', surface2: '#efe9df', surface3: '#e3dacb',
        accent: '#9a3412', secondary: '#b45309', textPrimary: '#1f1812', textSecondary: '#46382c', textMuted: '#5e4c3d',
        textOnAccent: '#ffffff', borderControl: '#856e57', borderSurface: '#c7b8a3', borderDivider: '#d6c9b7',
        borderFocus: '#7c2d12', notificationStyle: 'liquid', shapePreset: 'editorial', displayFont: 'editorial-serif'
    },
    'minimalist-obsidian': {
        mode: 'dark', bgCanvas: '#000000', surface1: '#14191f', surface2: '#1d2630', surface3: '#263442',
        accent: '#22d3ee', secondary: '#38bdf8', textPrimary: '#ffffff', textSecondary: '#cde3ec', textMuted: '#99b8c7',
        textOnAccent: '#031519', borderControl: '#4e7588', borderSurface: '#27404e', borderDivider: '#1f333f',
        borderFocus: '#67e8f9', notificationStyle: 'segmented', shapePreset: 'sharp', displayFont: 'system-sans'
    }
});

const SAFE_HEX_RE = /^#[0-9a-f]{6}$/i;
const SAFE_FONT_NAME_RE = /^[A-Za-z0-9 _-]{1,64}$/;
const SAFE_ASSET_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const SAFE_CUSTOM_ID_RE = /^custom:[a-z0-9_-]{3,48}$/;

function clampNum(v, min, max, fallback) {
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
}

function normHex(val, fallback) {
    if (typeof val === 'string' && SAFE_HEX_RE.test(val.trim())) {
        return val.trim().toLowerCase();
    }
    const parsed = parseColor(val);
    return parsed ? srgbToHex(parsed) : fallback.toLowerCase();
}

function normFontName(val) {
    if (typeof val !== 'string') return '';
    const cleaned = val.trim().replace(/\s+/g, ' ');
    return SAFE_FONT_NAME_RE.test(cleaned) ? cleaned : '';
}

function sanitizeThemeName(raw, fallback = 'Custom Studio') {
    const cleaned = String(raw ?? '')
        .replace(/<[^>]*>/g, '')
        .replace(/[\u0000-\u001f<>]/g, '')
        .trim()
        .slice(0, 48);
    return cleaned || fallback;
}

function defaultGradient(primaryHex, secondaryHex) {
    return {
        type: 'linear',
        angle: 135,
        stops: [
            { color: primaryHex, pos: 0 },
            { color: secondaryHex, pos: 100 }
        ]
    };
}

function createScopeBackground(colorHex, accentHex, scrimHex, extra = {}) {
    return {
        mode: 'solid',
        color: colorHex,
        gradient: defaultGradient(colorHex, accentHex),
        textureId: 'none',
        textureColor: accentHex,
        textureOpacity: 0.16,
        textureScale: 32,
        imageAssetId: '',
        fit: 'cover',
        scale: 100,
        posX: 50,
        posY: 50,
        opacity: 1,
        blurPx: 0,
        blendMode: 'normal',
        scrimColor: scrimHex,
        scrimOpacity: 0,
        ...extra
    };
}

function normalizeScopeBackground(raw, defaults) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const mode = BG_MODES.includes(src.mode) ? src.mode : defaults.mode;
    const rawGrad = src.gradient && typeof src.gradient === 'object' ? src.gradient : defaults.gradient;
    const gradType = GRADIENT_TYPES.includes(rawGrad.type) ? rawGrad.type : defaults.gradient.type;
    const rawStops = Array.isArray(rawGrad.stops) ? rawGrad.stops.slice(0, 5) : defaults.gradient.stops;
    const stops = rawStops.length >= 2
        ? rawStops.map((st, idx) => ({
            color: normHex(st?.color, defaults.color),
            pos: Math.round(clampNum(st?.pos, 0, 100, idx === 0 ? 0 : 100))
        }))
        : defaults.gradient.stops.map(s => ({ ...s }));
    stops.sort((a, b) => a.pos - b.pos);

    const imageAssetId = (typeof src.imageAssetId === 'string' && SAFE_ASSET_ID_RE.test(src.imageAssetId))
        ? src.imageAssetId
        : '';

    return {
        mode: mode === 'image' && !imageAssetId ? defaults.mode : mode,
        color: normHex(src.color, defaults.color),
        gradient: {
            type: gradType,
            angle: Math.round(clampNum(rawGrad.angle, 0, 360, defaults.gradient.angle)),
            stops
        },
        textureId: VALID_TEXTURE_IDS.has(src.textureId) ? src.textureId : defaults.textureId,
        textureColor: normHex(src.textureColor, defaults.textureColor),
        textureOpacity: clampNum(src.textureOpacity, 0, 1, defaults.textureOpacity),
        textureScale: Math.round(clampNum(src.textureScale, 10, 192, defaults.textureScale)),
        imageAssetId,
        fit: BG_FITS.includes(src.fit) ? src.fit : defaults.fit,
        scale: Math.round(clampNum(src.scale, 25, 250, defaults.scale)),
        posX: Math.round(clampNum(src.posX, 0, 100, defaults.posX)),
        posY: Math.round(clampNum(src.posY, 0, 100, defaults.posY)),
        opacity: clampNum(src.opacity, 0.05, 1, defaults.opacity),
        blurPx: Math.round(clampNum(src.blurPx, 0, 24, defaults.blurPx)),
        blendMode: BLEND_MODES.includes(src.blendMode) ? src.blendMode : defaults.blendMode,
        scrimColor: normHex(src.scrimColor, defaults.scrimColor),
        scrimOpacity: clampNum(src.scrimOpacity, 0, 0.95, defaults.scrimOpacity)
    };
}

export function generateCustomThemeId() {
    const rand = (globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`)
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        .slice(0, 14);
    return `${CUSTOM_THEME_PREFIX}t_${rand}`;
}

/**
 * Create a complete validated CustomThemeV1 starting from any of the 12 built-in themes.
 */
export function createDefaultCustomTheme(name = 'Custom Studio', baseThemeId = 'default', explicitId = null) {
    const baseTheme = normalizeThemeId(baseThemeId);
    const tpl = BUILTIN_THEME_TEMPLATES[baseTheme] || BUILTIN_THEME_TEMPLATES.default;
    const shape = SHAPE_PRESETS[tpl.shapePreset] || SHAPE_PRESETS.editorial;
    const isLight = tpl.mode === 'light';
    const scrimHex = isLight ? '#faf8f5' : '#06080d';

    return {
        schemaVersion: CUSTOM_THEME_SCHEMA_VERSION,
        id: (typeof explicitId === 'string' && SAFE_CUSTOM_ID_RE.test(explicitId)) ? explicitId : generateCustomThemeId(),
        name: sanitizeThemeName(name, 'Custom Studio'),
        mode: tpl.mode,
        baseTheme,
        notificationStyle: tpl.notificationStyle,
        updatedAt: Date.now(),
        colors: {
            bgCanvas: tpl.bgCanvas,
            surface1: tpl.surface1,
            surface2: tpl.surface2,
            surface3: tpl.surface3,
            accent: tpl.accent,
            secondary: tpl.secondary,
            textPrimary: tpl.textPrimary,
            textSecondary: tpl.textSecondary,
            textMuted: tpl.textMuted,
            textOnAccent: tpl.textOnAccent,
            borderSurface: tpl.borderSurface,
            borderControl: tpl.borderControl,
            borderDivider: tpl.borderDivider,
            borderFocus: tpl.borderFocus,
            statusSuccess: isLight ? '#15803d' : '#4ade80',
            statusWarning: isLight ? '#b45309' : '#fbbf24',
            statusDanger: isLight ? '#b91c1c' : '#f87171'
        },
        backgrounds: {
            canvas: createScopeBackground(tpl.bgCanvas, tpl.surface2, scrimHex),
            panels: createScopeBackground(tpl.surface1, tpl.surface2, scrimHex),
            stage: createScopeBackground(tpl.bgCanvas, tpl.accent, scrimHex, { opacity: 1 }),
            chrome: createScopeBackground(tpl.surface1, tpl.surface2, scrimHex)
        },
        geometry: {
            preset: tpl.shapePreset in SHAPE_PRESETS ? tpl.shapePreset : 'editorial',
            panelRadius: shape.panelRadius,
            controlRadius: shape.controlRadius,
            playRadius: shape.playRadius,
            thumbRadius: shape.thumbRadius,
            panelBorderWidth: 1,
            panelBorderStyle: shape.panelBorderStyle,
            controlBorderWidth: 1,
            dividerWidth: 1,
            dividerStyle: 'solid',
            surfaceOpacity: 0.96,
            glassBlurPx: 0,
            shadowLevel: isLight ? 'subtle' : 'soft',
            density: 'comfortable'
        },
        typography: {
            displayFont: tpl.displayFont in FONT_STACK_PRESETS ? tpl.displayFont : 'system-sans',
            displayCustomName: '',
            bodyFont: 'system-sans',
            bodyCustomName: '',
            monoFont: 'technical-mono',
            monoCustomName: '',
            scale: 1,
            titleWeight: 700,
            bodyWeight: 500,
            titleTracking: -0.02,
            headingCase: 'none',
            lineHeight: 1.45
        },
        motion: {
            profile: 'fluid',
            durationScale: 1,
            easing: 'emphasized',
            customBezier: [0.22, 0.7, 0.25, 1],
            viewTransition: 'crossfade',
            modalAnimation: 'pop',
            buttonFeedback: 'subtle',
            tabMorph: 'glide',
            rowHoverLift: true,
            ambientMotion: 'none'
        }
    };
}

/**
 * Strictly validate and normalize an arbitrary user/storage theme object into a safe CustomThemeV1.
 */
export function validateAndNormalizeCustomTheme(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const baseTheme = VALID_THEME_IDS.includes(src.baseTheme) ? src.baseTheme : normalizeThemeId(src.baseTheme);
    const seed = createDefaultCustomTheme(src.name || 'Custom Studio', baseTheme, src.id);
    const mode = src.mode === 'light' || src.mode === 'dark' ? src.mode : seed.mode;

    const cSrc = src.colors && typeof src.colors === 'object' ? src.colors : {};
    const colors = {};
    for (const [key, defHex] of Object.entries(seed.colors)) {
        colors[key] = normHex(cSrc[key], defHex);
    }

    const bgSrc = src.backgrounds && typeof src.backgrounds === 'object' ? src.backgrounds : {};
    const backgrounds = {
        canvas: normalizeScopeBackground(bgSrc.canvas, seed.backgrounds.canvas),
        panels: normalizeScopeBackground(bgSrc.panels, seed.backgrounds.panels),
        stage: normalizeScopeBackground(bgSrc.stage, seed.backgrounds.stage),
        chrome: normalizeScopeBackground(bgSrc.chrome, seed.backgrounds.chrome)
    };

    const gSrc = src.geometry && typeof src.geometry === 'object' ? src.geometry : {};
    const geometry = {
        preset: gSrc.preset in SHAPE_PRESETS ? gSrc.preset : seed.geometry.preset,
        panelRadius: Math.round(clampNum(gSrc.panelRadius, 0, 28, seed.geometry.panelRadius)),
        controlRadius: Math.round(clampNum(gSrc.controlRadius, 0, 24, seed.geometry.controlRadius)),
        playRadius: Math.round(clampNum(gSrc.playRadius, 0, 50, seed.geometry.playRadius)),
        thumbRadius: Math.round(clampNum(gSrc.thumbRadius, 0, 24, seed.geometry.thumbRadius)),
        panelBorderWidth: Math.round(clampNum(gSrc.panelBorderWidth, 0, 3, seed.geometry.panelBorderWidth)),
        panelBorderStyle: BORDER_STYLES.includes(gSrc.panelBorderStyle) ? gSrc.panelBorderStyle : seed.geometry.panelBorderStyle,
        controlBorderWidth: Math.round(clampNum(gSrc.controlBorderWidth, 0, 3, seed.geometry.controlBorderWidth)),
        dividerWidth: Math.round(clampNum(gSrc.dividerWidth, 0, 2, seed.geometry.dividerWidth)),
        dividerStyle: BORDER_STYLES.includes(gSrc.dividerStyle) ? gSrc.dividerStyle : seed.geometry.dividerStyle,
        surfaceOpacity: clampNum(gSrc.surfaceOpacity, 0.45, 1, seed.geometry.surfaceOpacity),
        glassBlurPx: Math.round(clampNum(gSrc.glassBlurPx, 0, 16, seed.geometry.glassBlurPx)),
        shadowLevel: SHADOW_LEVELS.includes(gSrc.shadowLevel) ? gSrc.shadowLevel : seed.geometry.shadowLevel,
        density: DENSITY_MODES.includes(gSrc.density) ? gSrc.density : seed.geometry.density
    };

    const tSrc = src.typography && typeof src.typography === 'object' ? src.typography : {};
    const typography = {
        displayFont: tSrc.displayFont in FONT_STACK_PRESETS ? tSrc.displayFont : seed.typography.displayFont,
        displayCustomName: normFontName(tSrc.displayCustomName),
        bodyFont: tSrc.bodyFont in FONT_STACK_PRESETS ? tSrc.bodyFont : seed.typography.bodyFont,
        bodyCustomName: normFontName(tSrc.bodyCustomName),
        monoFont: tSrc.monoFont in FONT_STACK_PRESETS ? tSrc.monoFont : seed.typography.monoFont,
        monoCustomName: normFontName(tSrc.monoCustomName),
        scale: clampNum(tSrc.scale, 0.85, 1.20, seed.typography.scale),
        titleWeight: Math.round(clampNum(tSrc.titleWeight, 400, 900, seed.typography.titleWeight) / 50) * 50,
        bodyWeight: Math.round(clampNum(tSrc.bodyWeight, 400, 700, seed.typography.bodyWeight) / 50) * 50,
        titleTracking: clampNum(tSrc.titleTracking, -0.04, 0.12, seed.typography.titleTracking),
        headingCase: HEADING_CASES.includes(tSrc.headingCase) ? tSrc.headingCase : seed.typography.headingCase,
        lineHeight: clampNum(tSrc.lineHeight, 1.25, 1.75, seed.typography.lineHeight)
    };

    const mSrc = src.motion && typeof src.motion === 'object' ? src.motion : {};
    const rawBz = Array.isArray(mSrc.customBezier) && mSrc.customBezier.length === 4 ? mSrc.customBezier : seed.motion.customBezier;
    const motion = {
        profile: MOTION_PROFILES.includes(mSrc.profile) ? mSrc.profile : seed.motion.profile,
        durationScale: clampNum(mSrc.durationScale, 0, 2, seed.motion.durationScale),
        easing: (mSrc.easing === 'custom' || mSrc.easing in EASING_PRESETS) ? mSrc.easing : seed.motion.easing,
        customBezier: [
            clampNum(rawBz[0], 0, 1, 0.22),
            clampNum(rawBz[1], -0.4, 1.8, 0.7),
            clampNum(rawBz[2], 0, 1, 0.25),
            clampNum(rawBz[3], -0.4, 1.8, 1)
        ],
        viewTransition: VIEW_TRANSITIONS.includes(mSrc.viewTransition) ? mSrc.viewTransition : seed.motion.viewTransition,
        modalAnimation: MODAL_ANIMATIONS.includes(mSrc.modalAnimation) ? mSrc.modalAnimation : seed.motion.modalAnimation,
        buttonFeedback: BUTTON_FEEDBACKS.includes(mSrc.buttonFeedback) ? mSrc.buttonFeedback : seed.motion.buttonFeedback,
        tabMorph: TAB_MORPHS.includes(mSrc.tabMorph) ? mSrc.tabMorph : seed.motion.tabMorph,
        rowHoverLift: Boolean(mSrc.rowHoverLift ?? seed.motion.rowHoverLift),
        ambientMotion: AMBIENT_MOTIONS.includes(mSrc.ambientMotion) ? mSrc.ambientMotion : seed.motion.ambientMotion
    };

    return {
        schemaVersion: CUSTOM_THEME_SCHEMA_VERSION,
        id: seed.id,
        name: sanitizeThemeName(src.name || seed.name, seed.name),
        mode,
        baseTheme,
        notificationStyle: src.notificationStyle === 'liquid' || src.notificationStyle === 'segmented'
            ? src.notificationStyle
            : seed.notificationStyle,
        updatedAt: Number.isFinite(src.updatedAt) ? src.updatedAt : Date.now(),
        colors,
        backgrounds,
        geometry,
        typography,
        motion
    };
}

export function resolveFontFamilyCss(presetKey, customName) {
    const preset = FONT_STACK_PRESETS[presetKey]?.stack || FONT_STACK_PRESETS['system-sans'].stack;
    const clean = normFontName(customName);
    return clean ? `"${clean}", ${preset}` : preset;
}

/**
 * Compile a tiny safe CSS variable map for zero-FOUC theme-preload.js localStorage snapshot.
 * Only allows `--` property names and safe literal values (no `url(http...)`, expressions, or script).
 */
export function buildPreloadSnapshot(theme) {
    const t = validateAndNormalizeCustomTheme(theme);
    const c = t.colors;
    const vars = {
        '--bg-canvas': c.bgCanvas,
        '--workspace-canvas': c.bgCanvas,
        '--bg-surface-1': c.surface1,
        '--workspace-panel': c.surface1,
        '--bg-surface-2': c.surface2,
        '--bg-surface-3': c.surface3,
        '--bg-chrome': c.surface1,
        '--workspace-header': c.surface1,
        '--text-primary': c.textPrimary,
        '--text-secondary': c.textSecondary,
        '--text-muted': c.textMuted,
        '--text-accent': c.accent,
        '--text-on-accent': c.textOnAccent,
        '--accent-color': c.accent,
        '--accent-primary': c.accent,
        '--border-surface': c.borderSurface,
        '--border-control': c.borderControl,
        '--border-medium': c.borderControl,
        '--border-divider': c.borderDivider,
        '--border-subtle': c.borderDivider,
        '--border-focus': c.borderFocus,
        '--font-display': resolveFontFamilyCss(t.typography.displayFont, t.typography.displayCustomName),
        '--font-body': resolveFontFamilyCss(t.typography.bodyFont, t.typography.bodyCustomName),
        '--font-mono': resolveFontFamilyCss(t.typography.monoFont, t.typography.monoCustomName)
    };
    return {
        v: CUSTOM_THEME_SCHEMA_VERSION,
        id: t.id,
        name: t.name,
        mode: t.mode,
        chrome: c.bgCanvas,
        baseTheme: t.baseTheme,
        vars
    };
}

/**
 * Serialize a custom theme (+ optional small data-URL assets) for safe JSON file export.
 */
export function serializeThemeForExport(theme, embeddedAssets = {}) {
    const clean = validateAndNormalizeCustomTheme(theme);
    const safeAssets = {};
    for (const [assetId, dataUrl] of Object.entries(embeddedAssets || {})) {
        if (SAFE_ASSET_ID_RE.test(assetId) && typeof dataUrl === 'string' && /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(dataUrl)) {
            safeAssets[assetId] = dataUrl;
        }
    }
    return JSON.stringify({
        format: 'cachymusic-custom-theme',
        schemaVersion: CUSTOM_THEME_SCHEMA_VERSION,
        theme: clean,
        assets: safeAssets
    }, null, 2);
}

/**
 * Strictly parse & sanitize an imported theme JSON string.
 * Rejects oversized payloads, external URLs, executable tokens, or unknown formats.
 */
export function parseImportedThemeJson(jsonText) {
    if (typeof jsonText !== 'string' || !jsonText.trim()) {
        throw new Error('Empty theme file.');
    }
    if (jsonText.length > MAX_CUSTOM_THEME_JSON_BYTES) {
        throw new Error('Theme JSON exceeds the 3 MB import limit.');
    }
    if (/(?:expression\s*\(|javascript:|<script|@import\b)/i.test(jsonText)) {
        throw new Error('Theme JSON contains disallowed content.');
    }
    const parsed = JSON.parse(jsonText);
    if (!parsed || typeof parsed !== 'object') {
        throw new Error('Invalid theme JSON structure.');
    }
    const rawTheme = parsed.format === 'cachymusic-custom-theme' && parsed.theme
        ? parsed.theme
        : parsed;

    const normalized = validateAndNormalizeCustomTheme({
        ...rawTheme,
        id: generateCustomThemeId(),
        updatedAt: Date.now()
    });

    const assetMap = {};
    if (parsed.assets && typeof parsed.assets === 'object') {
        for (const [assetId, dataUrl] of Object.entries(parsed.assets)) {
            if (!SAFE_ASSET_ID_RE.test(assetId)) continue;
            if (typeof dataUrl !== 'string') continue;
            if (!/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(dataUrl)) {
                throw new Error(`Invalid embedded image asset "${assetId}".`);
            }
            assetMap[assetId] = dataUrl;
        }
    }

    // Clear imageAssetId references whose blobs weren't included in import
    for (const scope of ['canvas', 'panels', 'stage', 'chrome']) {
        const bg = normalized.backgrounds[scope];
        if (bg.mode === 'image' && bg.imageAssetId && !assetMap[bg.imageAssetId]) {
            bg.mode = 'solid';
            bg.imageAssetId = '';
        }
    }

    return { theme: normalized, assets: assetMap };
}
