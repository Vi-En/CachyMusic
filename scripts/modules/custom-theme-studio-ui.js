/**
 * Lazy-Loaded 6-Tab Custom Theme Studio UI:
 * - Colors & Planes (Dark/Light, Clone 12 built-ins, Extract Palette, BG/MG/FG/Accent)
 * - Backgrounds & Textures (4 scopes, Solid/Linear/Radial/Conic gradients, 11 procedural textures, uploaded images, blur/blend/scrim)
 * - Borders & Geometry (panel/control/divider widths, styles, focus ring, radii, shape presets, density)
 * - Typography (system stacks, optional QueryLocalFonts picker, scale, weights, tracking, casing, line-height)
 * - Motion & Morphing (profiles, duration scale, easing + custom cubic-bezier curve, View Transitions, modal/button/ambient motion, notification visualizer)
 * - Library & JSON Import/Export (saved presets, duplicate, palette-only / full bundle export, safe JSON import)
 */
import { escapeHtml, popModalState, pushModalState, showToast } from './utils.js';
import { store } from './state.js';
import { THEMES, VALID_THEME_IDS } from './theme-catalog.js';
import {
    AMBIENT_MOTIONS,
    BG_FITS,
    BG_MODES,
    BLEND_MODES,
    BORDER_STYLES,
    BUTTON_FEEDBACKS,
    DENSITY_MODES,
    EASING_PRESETS,
    FONT_STACK_PRESETS,
    GRADIENT_TYPES,
    HEADING_CASES,
    MODAL_ANIMATIONS,
    MOTION_PROFILES,
    SHADOW_LEVELS,
    SHAPE_PRESETS,
    TAB_MORPHS,
    VIEW_TRANSITIONS,
    createDefaultCustomTheme,
    generateCustomThemeId,
    parseImportedThemeJson,
    serializeThemeForExport,
    validateAndNormalizeCustomTheme
} from './custom-theme-schema.js';
import { TEXTURE_CATALOG, buildProceduralTextureUrl } from './custom-theme-textures.js';
import { autoFixThemeContrast } from './color-contrast.js';
import {
    applyCustomTheme,
    auditCustomTheme,
    getActiveCustomTheme,
    processThemeBackgroundImage,
    runViewTransition
} from './custom-theme-engine.js';
import {
    blobToDataUrl,
    dataUrlToBlob,
    deleteCustomTheme,
    generateThemeAssetId,
    getCustomTheme,
    getThemeAsset,
    listCustomThemes,
    saveCustomTheme,
    saveThemeAsset
} from './custom-theme-store.js';
import { applyTheme, renderCustomThemeCardsInModal, updateActiveThemeIndicators } from './themes.js';

const TABS = [
    { id: 'colors', label: 'Colors & Planes' },
    { id: 'backgrounds', label: 'Backgrounds & Textures' },
    { id: 'geometry', label: 'Borders & Geometry' },
    { id: 'typography', label: 'Typography' },
    { id: 'motion', label: 'Motion & Animations' },
    { id: 'library', label: 'Saved & Import/Export' }
];

const BG_SCOPES = [
    { id: 'canvas', label: 'App Canvas' },
    { id: 'panels', label: 'Middleground Panels' },
    { id: 'stage', label: 'Player Stage' },
    { id: 'chrome', label: 'Chrome & Navigation' }
];

const GRADIENT_PRESETS = [
    { name: 'Midnight Teal', type: 'linear', angle: 135, stops: [{ color: '#08121a', pos: 0 }, { color: '#112a3d', pos: 55 }, { color: '#091926', pos: 100 }] },
    { name: 'Crimson Horizon', type: 'linear', angle: 150, stops: [{ color: '#1a080d', pos: 0 }, { color: '#3b111c', pos: 52 }, { color: '#120b18', pos: 100 }] },
    { name: 'Solar Eclipse', type: 'radial', angle: 0, stops: [{ color: '#1a2356', pos: 0 }, { color: '#0d102b', pos: 60 }, { color: '#070814', pos: 100 }] },
    { name: 'Emerald Depth', type: 'linear', angle: 145, stops: [{ color: '#05150f', pos: 0 }, { color: '#0f382a', pos: 60 }, { color: '#071b1c', pos: 100 }] },
    { name: 'Warm Espresso', type: 'linear', angle: 160, stops: [{ color: '#f7f1e7', pos: 0 }, { color: '#eadcc8', pos: 100 }] },
    { name: 'Studio Slate', type: 'conic', angle: 45, stops: [{ color: '#111923', pos: 0 }, { color: '#1a293a', pos: 50 }, { color: '#111923', pos: 100 }] }
];

const studio = {
    isOpen: false,
    isPeek: false,
    activeTab: 'colors',
    activeBgScope: 'canvas',
    draft: null,
    originalSnapshot: null,
    undoStack: [],
    redoStack: [],
    savedThemes: [],
    lastExtractedPalette: null,
    triggerEl: null
};

function modalEls() {
    return {
        backdrop: document.getElementById('customThemeStudioModal'),
        card: document.getElementById('customThemeStudioCard')
    };
}

function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
        if (k === 'className') node.className = v;
        else if (k === 'textContent') node.textContent = v;
        else if (k === 'style' && typeof v === 'string') node.style.cssText = v;
        else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
        else if (v !== null && v !== undefined && v !== false) node.setAttribute(k, v === true ? '' : String(v));
    }
    for (const ch of (Array.isArray(children) ? children : [children])) {
        if (ch !== null && ch !== undefined) node.append(typeof ch === 'string' ? document.createTextNode(ch) : ch);
    }
    return node;
}

function pushUndoSnapshot() {
    if (!studio.draft) return;
    studio.undoStack.push(JSON.stringify(studio.draft));
    if (studio.undoStack.length > 30) studio.undoStack.shift();
    studio.redoStack.length = 0;
}

async function applyDraftUpdate(mutatorFn, { recordUndo = true, reRenderBody = false } = {}) {
    if (!studio.draft) return;
    if (recordUndo) pushUndoSnapshot();
    mutatorFn(studio.draft);
    studio.draft = validateAndNormalizeCustomTheme(studio.draft);
    await applyCustomTheme(studio.draft, { persist: false, previewOnly: true });
    updateHeaderAndContrast();
    if (reRenderBody) renderActiveTabBody();
}

export async function undoThemeStudio() {
    if (!studio.isOpen || studio.undoStack.length === 0) return false;
    studio.redoStack.push(JSON.stringify(studio.draft));
    studio.draft = validateAndNormalizeCustomTheme(JSON.parse(studio.undoStack.pop()));
    await applyCustomTheme(studio.draft, { persist: false, previewOnly: true });
    renderStudioShell();
    return true;
}

export async function redoThemeStudio() {
    if (!studio.isOpen || studio.redoStack.length === 0) return false;
    studio.undoStack.push(JSON.stringify(studio.draft));
    studio.draft = validateAndNormalizeCustomTheme(JSON.parse(studio.redoStack.pop()));
    await applyCustomTheme(studio.draft, { persist: false, previewOnly: true });
    renderStudioShell();
    return true;
}

function updateHeaderAndContrast() {
    const contrastBar = document.getElementById('ctContrastMeters');
    const undoBtn = document.getElementById('ctUndoBtn');
    const redoBtn = document.getElementById('ctRedoBtn');
    const nameInput = document.getElementById('ctThemeNameInput');
    if (undoBtn) undoBtn.disabled = studio.undoStack.length === 0;
    if (redoBtn) redoBtn.disabled = studio.redoStack.length === 0;
    if (nameInput && studio.draft && nameInput.value !== studio.draft.name && document.activeElement !== nameInput) {
        nameInput.value = studio.draft.name;
    }
    if (!contrastBar || !studio.draft) return;

    const audit = auditCustomTheme(studio.draft);
    const pills = [
        { label: `Primary Text ${audit.metrics.primaryTextOnSurface1}:1`, ok: audit.checks.primaryText, req: audit.checks.primaryTextAAA ? 'AAA' : 'AA' },
        { label: `Muted Text ${audit.metrics.mutedTextOnSurface2}:1`, ok: audit.checks.mutedText, req: '4.5+' },
        { label: `On Accent ${audit.metrics.textOnAccent}:1`, ok: audit.checks.onAccent, req: '4.5+' },
        { label: `Control Borders ${audit.metrics.controlBorderOnSurface2}:1`, ok: audit.checks.controlBorder, req: '3.0+' },
        { label: `Focus Ring ${audit.metrics.focusBorderOnSurface1}:1`, ok: audit.checks.focusBorder, req: '4.5+' },
        { label: `BG↔MG ΔL ${audit.metrics.planeDeltaL}`, ok: audit.checks.planeSeparation, req: 'Depth' }
    ];
    contrastBar.replaceChildren(...pills.map(p =>
        el('span', { className: `ctContrastPill ${p.ok ? 'is-pass' : 'is-fail'}`, textContent: `${p.label} · ${p.ok ? p.req : 'FIX'}` })
    ));
}

function makeColorRow(labelText, getVal, onChangeHex) {
    const val = getVal();
    const picker = el('input', { type: 'color', className: 'ctColorInput', value: val, 'aria-label': `${labelText} color picker` });
    const hexIn = el('input', { type: 'text', className: 'ctHexInput', value: val, maxlength: '7', 'aria-label': `${labelText} hex value` });

    picker.addEventListener('change', () => {
        hexIn.value = picker.value.toLowerCase();
        void applyDraftUpdate(() => onChangeHex(picker.value.toLowerCase()));
    });
    hexIn.addEventListener('change', () => {
        if (/^#[0-9a-f]{6}$/i.test(hexIn.value.trim())) {
            const clean = hexIn.value.trim().toLowerCase();
            picker.value = clean;
            hexIn.value = clean;
            void applyDraftUpdate(() => onChangeHex(clean));
        } else {
            hexIn.value = getVal();
        }
    });
    return el('div', { className: 'ctColorRow' }, [el('label', { textContent: labelText }), picker, hexIn]);
}

function makeSliderRow(labelText, min, max, step, getVal, fmtVal, onInputVal, reRender = false) {
    const out = el('output', { textContent: fmtVal(getVal()) });
    const input = el('input', { type: 'range', min: String(min), max: String(max), step: String(step), value: String(getVal()), 'aria-label': labelText });
    input.addEventListener('input', () => {
        const num = Number(input.value);
        out.textContent = fmtVal(num);
        void applyDraftUpdate(() => onInputVal(num), { recordUndo: false });
    });
    input.addEventListener('change', () => {
        const num = Number(input.value);
        out.textContent = fmtVal(num);
        void applyDraftUpdate(() => onInputVal(num), { recordUndo: true, reRenderBody: reRender });
    });
    return el('div', { className: 'ctSliderRow' }, [
        el('div', { className: 'ctSliderHeader' }, [el('span', { textContent: labelText }), out]),
        input
    ]);
}

function makeSelectRow(labelText, options, currentVal, onChange) {
    const sel = el('select', { className: 'settingsSelect', 'aria-label': labelText });
    for (const opt of options) {
        const item = el('option', { value: opt.value, textContent: opt.label });
        if (opt.value === currentVal) item.selected = true;
        sel.appendChild(item);
    }
    sel.addEventListener('change', () => onChange(sel.value));
    return el('div', { className: 'ctSliderRow' }, [
        el('div', { className: 'ctSliderHeader' }, [el('span', { textContent: labelText })]),
        sel
    ]);
}

function renderColorsTab(body) {
    const d = studio.draft;
    const grid = el('div', { className: 'ctSectionGrid' });

    const setupCard = el('div', { className: 'ctCard' }, [
        el('h4', { textContent: 'Base Polarity & Preset Seeding' }),
        el('div', { className: 'ctPillGroup' }, [
            el('button', {
                type: 'button',
                className: `ctPillBtn ${d.mode === 'dark' ? 'active' : ''}`,
                textContent: 'Dark Mode',
                onclick: () => void applyDraftUpdate(t => { t.mode = 'dark'; }, { reRenderBody: true })
            }),
            el('button', {
                type: 'button',
                className: `ctPillBtn ${d.mode === 'light' ? 'active' : ''}`,
                textContent: 'Light Mode',
                onclick: () => void applyDraftUpdate(t => { t.mode = 'light'; }, { reRenderBody: true })
            })
        ]),
        makeSelectRow('Clone Colors & Character From Built-In Theme', [
            { value: '', label: 'Choose a built-in theme to clone...' },
            ...VALID_THEME_IDS.map(id => ({ value: id, label: `${THEMES[id].name} (${id})` }))
        ], '', (baseId) => {
            if (!baseId) return;
            const seeded = createDefaultCustomTheme(studio.draft.name, baseId, studio.draft.id);
            void applyDraftUpdate(t => {
                t.mode = seeded.mode;
                t.baseTheme = seeded.baseTheme;
                t.notificationStyle = seeded.notificationStyle;
                t.colors = seeded.colors;
                t.geometry.preset = seeded.geometry.preset;
                t.geometry.panelRadius = seeded.geometry.panelRadius;
                t.geometry.controlRadius = seeded.geometry.controlRadius;
                t.geometry.playRadius = seeded.geometry.playRadius;
            }, { reRenderBody: true });
        }),
        el('button', {
            type: 'button',
            className: 'actionBtn',
            textContent: 'Extract Palette from Canvas Image',
            disabled: !studio.lastExtractedPalette,
            title: studio.lastExtractedPalette ? 'Derive BG, Middleground & Accent from active background image' : 'Upload a background image in Backgrounds & Textures first',
            onclick: () => {
                if (!studio.lastExtractedPalette) return;
                const p = studio.lastExtractedPalette;
                void applyDraftUpdate(t => {
                    t.mode = p.mode;
                    t.colors.bgCanvas = p.bgCanvas;
                    t.colors.surface1 = p.surface1;
                    t.colors.surface2 = p.surface2;
                    t.colors.surface3 = p.surface3;
                    t.colors.accent = p.accent;
                    t.colors.secondary = p.secondary;
                    const fixed = autoFixThemeContrast(t);
                    t.colors = fixed.colors;
                }, { reRenderBody: true });
                showToast('Palette extracted and contrast balanced.');
            }
        })
    ]);

    const planesCard = el('div', { className: 'ctCard' }, [
        el('h4', { textContent: 'Background & Middleground Planes' }),
        makeColorRow('Background Canvas (BG)', () => d.colors.bgCanvas, v => { d.colors.bgCanvas = v; d.backgrounds.canvas.color = v; }),
        makeColorRow('Middleground Panel (S1)', () => d.colors.surface1, v => { d.colors.surface1 = v; d.backgrounds.panels.color = v; }),
        makeColorRow('Elevated Control (S2)', () => d.colors.surface2, v => { d.colors.surface2 = v; }),
        makeColorRow('Active / Hover Surface (S3)', () => d.colors.surface3, v => { d.colors.surface3 = v; }),
        makeSliderRow('Surface Opacity', 0.45, 1, 0.02, () => d.geometry.surfaceOpacity, v => `${Math.round(v * 100)}%`, v => { d.geometry.surfaceOpacity = v; }),
        makeSliderRow('Glass Blur (Chrome/Mini)', 0, 16, 1, () => d.geometry.glassBlurPx, v => `${v}px`, v => { d.geometry.glassBlurPx = v; })
    ]);

    const fgCard = el('div', { className: 'ctCard' }, [
        el('h4', { textContent: 'Foreground Text & Accent Hierarchy' }),
        makeColorRow('Primary Text (FG)', () => d.colors.textPrimary, v => { d.colors.textPrimary = v; }),
        makeColorRow('Secondary Text', () => d.colors.textSecondary, v => { d.colors.textSecondary = v; }),
        makeColorRow('Muted / Subtext', () => d.colors.textMuted, v => { d.colors.textMuted = v; }),
        makeColorRow('Primary Accent', () => d.colors.accent, v => { d.colors.accent = v; }),
        makeColorRow('Secondary Highlight', () => d.colors.secondary, v => { d.colors.secondary = v; }),
        makeColorRow('Text On Accent', () => d.colors.textOnAccent, v => { d.colors.textOnAccent = v; })
    ]);

    const statusCard = el('div', { className: 'ctCard' }, [
        el('h4', { textContent: 'Semantic Status & Depth' }),
        makeColorRow('Success / Bit-Perfect', () => d.colors.statusSuccess, v => { d.colors.statusSuccess = v; }),
        makeColorRow('Warning / Amplified', () => d.colors.statusWarning, v => { d.colors.statusWarning = v; }),
        makeColorRow('Danger / Error', () => d.colors.statusDanger, v => { d.colors.statusDanger = v; }),
        makeSelectRow('Elevation Shadows', SHADOW_LEVELS.map(s => ({ value: s, label: s[0].toUpperCase() + s.slice(1) })), d.geometry.shadowLevel, v => {
            void applyDraftUpdate(t => { t.geometry.shadowLevel = v; });
        })
    ]);

    grid.append(setupCard, planesCard, fgCard, statusCard);
    body.appendChild(grid);
}

function renderBackgroundsTab(body) {
    const scopeBar = el('div', { className: 'ctPillGroup', role: 'tablist' }, BG_SCOPES.map(sc =>
        el('button', {
            type: 'button',
            className: `ctPillBtn ${studio.activeBgScope === sc.id ? 'active' : ''}`,
            textContent: sc.label,
            onclick: () => {
                studio.activeBgScope = sc.id;
                renderActiveTabBody();
            }
        })
    ));
    body.appendChild(scopeBar);

    const sc = studio.draft.backgrounds[studio.activeBgScope];
    const grid = el('div', { className: 'ctSectionGrid' });

    const modeCard = el('div', { className: 'ctCard' }, [
        el('h4', { textContent: `${BG_SCOPES.find(s => s.id === studio.activeBgScope)?.label} Fill Mode` }),
        el('div', { className: 'ctPillGroup' }, BG_MODES.map(m =>
            el('button', {
                type: 'button',
                className: `ctPillBtn ${sc.mode === m ? 'active' : ''}`,
                textContent: m[0].toUpperCase() + m.slice(1),
                onclick: () => void applyDraftUpdate(t => {
                    t.backgrounds[studio.activeBgScope].mode = m;
                    if (m === 'texture' && t.backgrounds[studio.activeBgScope].textureId === 'none') {
                        t.backgrounds[studio.activeBgScope].textureId = 'blueprint-grid';
                    }
                }, { reRenderBody: true })
            })
        )),
        makeColorRow('Base Color', () => sc.color, v => { sc.color = v; }),
        makeColorRow('Legibility Scrim Color', () => sc.scrimColor, v => { sc.scrimColor = v; }),
        makeSliderRow('Scrim Protection Opacity', 0, 0.95, 0.05, () => sc.scrimOpacity, v => `${Math.round(v * 100)}%`, v => { sc.scrimOpacity = v; })
    ]);
    grid.appendChild(modeCard);

    if (sc.mode === 'gradient') {
        const g = sc.gradient;
        const gradCard = el('div', { className: 'ctCard' }, [
            el('h4', { textContent: 'Multi-Stop Gradient Builder' }),
            makeSelectRow('Gradient Type', GRADIENT_TYPES.map(gt => ({ value: gt, label: gt.toUpperCase() })), g.type, v => {
                void applyDraftUpdate(t => { t.backgrounds[studio.activeBgScope].gradient.type = v; }, { reRenderBody: true });
            }),
            makeSliderRow('Gradient Angle', 0, 360, 5, () => g.angle, v => `${v}°`, v => { g.angle = v; })
        ]);
        g.stops.forEach((st, idx) => {
            gradCard.appendChild(makeColorRow(`Stop ${idx + 1} (${st.pos}%)`, () => st.color, v => { st.color = v; }));
            gradCard.appendChild(makeSliderRow(`Stop ${idx + 1} Position`, 0, 100, 1, () => st.pos, v => `${v}%`, v => { st.pos = v; }));
        });
        const stopActions = el('div', { className: 'ctPillGroup' }, [
            el('button', {
                type: 'button', className: 'actionBtn', textContent: '+ Add Stop', disabled: g.stops.length >= 5,
                onclick: () => void applyDraftUpdate(() => { g.stops.push({ color: studio.draft.colors.accent, pos: 50 }); }, { reRenderBody: true })
            }),
            el('button', {
                type: 'button', className: 'actionBtn', textContent: 'Remove Stop', disabled: g.stops.length <= 2,
                onclick: () => void applyDraftUpdate(() => { g.stops.pop(); }, { reRenderBody: true })
            })
        ]);
        gradCard.appendChild(stopActions);
        gradCard.appendChild(el('div', { className: 'ctPillGroup' }, GRADIENT_PRESETS.map(p =>
            el('button', {
                type: 'button', className: 'ctPillBtn', textContent: p.name,
                onclick: () => void applyDraftUpdate(() => { sc.gradient = structuredClone(p); }, { reRenderBody: true })
            })
        )));
        grid.appendChild(gradCard);
    }

    if (sc.mode === 'texture') {
        const texCard = el('div', { className: 'ctCard' }, [
            el('h4', { textContent: 'Procedural SVG Textures (Zero Network)' }),
            makeColorRow('Texture Tint Color', () => sc.textureColor, v => { sc.textureColor = v; }, true),
            makeSliderRow('Texture Strength', 0, 1, 0.02, () => sc.textureOpacity, v => `${Math.round(v * 100)}%`, v => { sc.textureOpacity = v; }, true),
            makeSliderRow('Texture Tile Size', 10, 160, 2, () => sc.textureScale, v => `${v}px`, v => { sc.textureScale = v; }, true),
            el('div', { className: 'ctTextureGrid' }, TEXTURE_CATALOG.map(tx => {
                const bgImg = buildProceduralTextureUrl(tx.id, sc.textureColor, Math.max(0.28, sc.textureOpacity), Math.min(48, tx.defaultScale));
                return el('button', {
                    type: 'button',
                    className: `ctTextureTileBtn ${sc.textureId === tx.id ? 'active' : ''}`,
                    style: `background-image:${bgImg};background-size:${Math.min(48, tx.defaultScale)}px;background-repeat:repeat;`,
                    textContent: tx.name,
                    onclick: () => void applyDraftUpdate(() => { sc.textureId = tx.id; }, { reRenderBody: true })
                });
            }))
        ]);
        grid.appendChild(texCard);
    }

    if (sc.mode === 'image') {
        const fileInput = el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', style: 'display:none', 'aria-label': 'Upload background image or texture' });
        fileInput.addEventListener('change', async () => {
            const file = fileInput.files?.[0];
            fileInput.value = '';
            if (!file) return;
            try {
                showToast('Processing background image off main thread...');
                const processed = await processThemeBackgroundImage(file, { scope: studio.activeBgScope, fit: sc.fit });
                const assetId = generateThemeAssetId();
                await saveThemeAsset(assetId, processed.blob, processed);
                if (processed.palette) studio.lastExtractedPalette = processed.palette;
                await applyDraftUpdate(t => {
                    const target = t.backgrounds[studio.activeBgScope];
                    target.mode = 'image';
                    target.imageAssetId = assetId;
                    target.scrimOpacity = Math.max(target.scrimOpacity, 0.52);
                }, { reRenderBody: true });
                showToast(`Image applied (${processed.width}×${processed.height}). Scrim added for contrast.`);
            } catch (err) {
                showToast(err?.message || 'Image could not be loaded.', true);
            }
        });

        const imgCard = el('div', { className: 'ctCard' }, [
            el('h4', { textContent: 'Local Image / Custom Texture Upload' }),
            fileInput,
            el('div', { className: 'ctPillGroup' }, [
                el('button', { type: 'button', className: 'actionBtn primaryBtn', textContent: sc.imageAssetId ? 'Replace Image' : 'Upload PNG / JPEG / WebP', onclick: () => fileInput.click() }),
                sc.imageAssetId ? el('button', {
                    type: 'button', className: 'actionBtn dangerBtn', textContent: 'Clear Image',
                    onclick: () => void applyDraftUpdate(() => { sc.imageAssetId = ''; sc.mode = 'solid'; }, { reRenderBody: true })
                }) : null
            ]),
            makeSelectRow('Image Fit / Tiling', BG_FITS.map(f => ({ value: f, label: f[0].toUpperCase() + f.slice(1) })), sc.fit, v => {
                void applyDraftUpdate(() => { sc.fit = v; });
            }),
            makeSelectRow('Blend Mode', BLEND_MODES.map(b => ({ value: b, label: b })), sc.blendMode, v => {
                void applyDraftUpdate(() => { sc.blendMode = v; });
            }),
            makeSliderRow('Image Opacity', 0.1, 1, 0.05, () => sc.opacity, v => `${Math.round(v * 100)}%`, v => { sc.opacity = v; }),
            makeSliderRow('Image Blur', 0, 24, 1, () => sc.blurPx, v => `${v}px`, v => { sc.blurPx = v; }),
            makeSliderRow('Scale / Tile Size', 35, 220, 5, () => sc.scale, v => `${v}%`, v => { sc.scale = v; }),
            makeSliderRow('Position X', 0, 100, 1, () => sc.posX, v => `${v}%`, v => { sc.posX = v; }),
            makeSliderRow('Position Y', 0, 100, 1, () => sc.posY, v => `${v}%`, v => { sc.posY = v; })
        ]);
        grid.appendChild(imgCard);
    }

    body.appendChild(grid);
}

function renderGeometryTab(body) {
    const d = studio.draft;
    const grid = el('div', { className: 'ctSectionGrid' });

    const borderCard = el('div', { className: 'ctCard' }, [
        el('h4', { textContent: 'Borders, Lines & Hairlines' }),
        makeColorRow('Surface Panel Border', () => d.colors.borderSurface, v => { d.colors.borderSurface = v; }),
        makeColorRow('Interactive Control Border (≥ 3:1)', () => d.colors.borderControl, v => { d.colors.borderControl = v; }),
        makeColorRow('List / Row Divider Line', () => d.colors.borderDivider, v => { d.colors.borderDivider = v; }),
        makeColorRow('Keyboard Focus Outline', () => d.colors.borderFocus, v => { d.colors.borderFocus = v; }),
        makeSliderRow('Panel Border Width', 0, 3, 1, () => d.geometry.panelBorderWidth, v => `${v}px`, v => { d.geometry.panelBorderWidth = v; }),
        makeSelectRow('Panel Border Style', BORDER_STYLES.map(s => ({ value: s, label: s[0].toUpperCase() + s.slice(1) })), d.geometry.panelBorderStyle, v => {
            void applyDraftUpdate(() => { d.geometry.panelBorderStyle = v; });
        }),
        makeSliderRow('Control Border Width', 0, 3, 1, () => d.geometry.controlBorderWidth, v => `${v}px`, v => { d.geometry.controlBorderWidth = v; }),
        makeSliderRow('Row Divider Width', 0, 2, 1, () => d.geometry.dividerWidth, v => `${v}px`, v => { d.geometry.dividerWidth = v; }),
        makeSelectRow('Row Divider Style', BORDER_STYLES.map(s => ({ value: s, label: s[0].toUpperCase() + s.slice(1) })), d.geometry.dividerStyle, v => {
            void applyDraftUpdate(() => { d.geometry.dividerStyle = v; });
        })
    ]);

    const shapeCard = el('div', { className: 'ctCard' }, [
        el('h4', { textContent: 'Shape Presets, Corners & Density' }),
        el('div', { className: 'ctPillGroup' }, Object.entries(SHAPE_PRESETS).map(([key, sh]) =>
            el('button', {
                type: 'button',
                className: `ctPillBtn ${d.geometry.preset === key ? 'active' : ''}`,
                textContent: sh.label,
                onclick: () => void applyDraftUpdate(t => {
                    t.geometry.preset = key;
                    t.geometry.panelRadius = sh.panelRadius;
                    t.geometry.controlRadius = sh.controlRadius;
                    t.geometry.playRadius = sh.playRadius;
                    t.geometry.thumbRadius = sh.thumbRadius;
                    t.geometry.panelBorderStyle = sh.panelBorderStyle;
                }, { reRenderBody: true })
            })
        )),
        makeSliderRow('Panel & Modal Radius', 0, 28, 1, () => d.geometry.panelRadius, v => `${v}px`, v => { d.geometry.panelRadius = v; }),
        makeSliderRow('Button & Input Radius', 0, 24, 1, () => d.geometry.controlRadius, v => `${v}px`, v => { d.geometry.controlRadius = v; }),
        makeSliderRow('Play Button Roundness', 0, 50, 2, () => d.geometry.playRadius, v => (v >= 50 ? 'Circle' : `${v}%`), v => { d.geometry.playRadius = v; }),
        makeSliderRow('Artwork & Thumb Radius', 0, 24, 1, () => d.geometry.thumbRadius, v => `${v}px`, v => { d.geometry.thumbRadius = v; }),
        makeSelectRow('Spacing Density (Touch Targets ≥ 44px)', DENSITY_MODES.map(m => ({ value: m, label: m[0].toUpperCase() + m.slice(1) })), d.geometry.density, v => {
            void applyDraftUpdate(() => { d.geometry.density = v; });
        })
    ]);

    grid.append(borderCard, shapeCard);
    body.appendChild(grid);
}

function renderTypographyTab(body) {
    const ty = studio.draft.typography;
    const grid = el('div', { className: 'ctSectionGrid' });
    const fontOpts = Object.entries(FONT_STACK_PRESETS).map(([k, v]) => ({ value: k, label: v.label }));

    const makeFontCustomField = (label, getName, setName) => {
        const row = el('div', { className: 'ctSliderRow' });
        const input = el('input', {
            type: 'text', className: 'settingsInput', value: getName(),
            placeholder: 'Optional installed system font name (e.g. Inter)', 'aria-label': label
        });
        input.addEventListener('change', () => {
            void applyDraftUpdate(() => { setName(input.value); }, { reRenderBody: false });
        });
        const headerRow = el('div', { className: 'ctSliderHeader' }, [el('span', { textContent: label })]);
        row.append(headerRow, input);
        if (typeof window !== 'undefined' && typeof window.queryLocalFonts === 'function') {
            const pickBtn = el('button', {
                type: 'button', className: 'actionBtn', textContent: 'Pick Installed Font...',
                onclick: async () => {
                    try {
                        const fonts = await window.queryLocalFonts();
                        const families = Array.from(new Set(fonts.map(f => f.family))).slice(0, 60);
                        if (families.length === 0) return showToast('No local fonts returned.');
                        const choice = families[0];
                        const list = prompt(`Enter one of your installed font families:\n${families.slice(0, 18).join(', ')}...`, choice);
                        if (list) {
                            input.value = list;
                            await applyDraftUpdate(() => { setName(list); });
                        }
                    } catch (_) {
                        showToast('Local font permission declined.', true);
                    }
                }
            });
            row.appendChild(pickBtn);
        }
        return row;
    };

    const stacksCard = el('div', { className: 'ctCard' }, [
        el('h4', { textContent: 'System Font Families (Privacy-Safe, Zero Network)' }),
        makeSelectRow('Display & Title Font', fontOpts, ty.displayFont, v => void applyDraftUpdate(() => { ty.displayFont = v; })),
        makeFontCustomField('Custom Display Font Name', () => ty.displayCustomName, v => { ty.displayCustomName = v; }),
        makeSelectRow('Body & UI Font', fontOpts, ty.bodyFont, v => void applyDraftUpdate(() => { ty.bodyFont = v; })),
        makeFontCustomField('Custom Body Font Name', () => ty.bodyCustomName, v => { ty.bodyCustomName = v; }),
        makeSelectRow('Technical / Timecode Mono Font', fontOpts, ty.monoFont, v => void applyDraftUpdate(() => { ty.monoFont = v; }))
    ]);

    const metricsCard = el('div', { className: 'ctCard' }, [
        el('h4', { textContent: 'Scale, Weight & Rhythm' }),
        makeSliderRow('Global Text Scale', 0.85, 1.20, 0.01, () => ty.scale, v => `${Math.round(v * 100)}%`, v => { ty.scale = v; }),
        makeSliderRow('Title Weight', 400, 900, 50, () => ty.titleWeight, v => String(v), v => { ty.titleWeight = v; }),
        makeSliderRow('Body Weight', 400, 700, 50, () => ty.bodyWeight, v => String(v), v => { ty.bodyWeight = v; }),
        makeSliderRow('Title Letter Spacing', -0.04, 0.12, 0.005, () => ty.titleTracking, v => `${v.toFixed(3)}em`, v => { ty.titleTracking = v; }),
        makeSliderRow('Line Height', 1.25, 1.75, 0.05, () => ty.lineHeight, v => v.toFixed(2), v => { ty.lineHeight = v; }),
        makeSelectRow('Heading Casing', HEADING_CASES.map(c => ({ value: c, label: c[0].toUpperCase() + c.slice(1) })), ty.headingCase, v => {
            void applyDraftUpdate(() => { ty.headingCase = v; });
        })
    ]);

    grid.append(stacksCard, metricsCard);
    body.appendChild(grid);
}

function renderMotionTab(body) {
    const m = studio.draft.motion;
    const grid = el('div', { className: 'ctSectionGrid' });

    const [x1, y1, x2, y2] = m.customBezier;
    const bezSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    bezSvg.setAttribute('viewBox', '0 0 120 80');
    bezSvg.setAttribute('class', 'ctBezierSvg');
    bezSvg.setAttribute('aria-hidden', 'true');
    const sx = (x) => 12 + x * 96;
    const sy = (y) => 68 - Math.max(-0.2, Math.min(1.2, y)) * 56;
    bezSvg.innerHTML =
        `<line x1="12" y1="68" x2="108" y2="12" stroke="currentColor" stroke-opacity="0.22" stroke-dasharray="3 3"/>` +
        `<line x1="12" y1="68" x2="${sx(x1).toFixed(1)}" y2="${sy(y1).toFixed(1)}" stroke="var(--text-muted)" stroke-width="1"/>` +
        `<line x1="108" y1="12" x2="${sx(x2).toFixed(1)}" y2="${sy(y2).toFixed(1)}" stroke="var(--text-muted)" stroke-width="1"/>` +
        `<path d="M 12 68 C ${sx(x1).toFixed(1)} ${sy(y1).toFixed(1)}, ${sx(x2).toFixed(1)} ${sy(y2).toFixed(1)}, 108 12" fill="none" stroke="var(--accent-color)" stroke-width="2.5"/>`;

    const curveCard = el('div', { className: 'ctCard' }, [
        el('h4', { textContent: 'Motion Profile, Easing & Interpolation' }),
        makeSelectRow('Motion Profile', MOTION_PROFILES.map(p => ({ value: p, label: p[0].toUpperCase() + p.slice(1) })), m.profile, v => {
            void applyDraftUpdate(() => { m.profile = v; }, { reRenderBody: true });
        }),
        makeSliderRow('Animation Speed Scale', 0, 2, 0.05, () => m.durationScale, v => `${v.toFixed(2)}×`, v => { m.durationScale = v; }),
        makeSelectRow('Easing Curve', [
            ...Object.keys(EASING_PRESETS).map(k => ({ value: k, label: k })),
            { value: 'custom', label: 'Custom Cubic-Bezier' }
        ], m.easing, v => void applyDraftUpdate(() => { m.easing = v; }, { reRenderBody: true })),
        bezSvg,
        m.easing === 'custom' ? makeSliderRow('Bezier P1 X', 0, 1, 0.02, () => m.customBezier[0], v => v.toFixed(2), v => { m.customBezier[0] = v; }, true) : null,
        m.easing === 'custom' ? makeSliderRow('Bezier P1 Y', -0.4, 1.8, 0.02, () => m.customBezier[1], v => v.toFixed(2), v => { m.customBezier[1] = v; }, true) : null,
        m.easing === 'custom' ? makeSliderRow('Bezier P2 X', 0, 1, 0.02, () => m.customBezier[2], v => v.toFixed(2), v => { m.customBezier[2] = v; }, true) : null,
        m.easing === 'custom' ? makeSliderRow('Bezier P2 Y', -0.4, 1.8, 0.02, () => m.customBezier[3], v => v.toFixed(2), v => { m.customBezier[3] = v; }, true) : null
    ]);

    const morphCard = el('div', { className: 'ctCard' }, [
        el('h4', { textContent: 'Transitions, Morphing, Ambient & Android Sync' }),
        makeSelectRow('Workspace Morph (View Transition)', VIEW_TRANSITIONS.map(v => ({ value: v, label: v })), m.viewTransition, v => {
            void applyDraftUpdate(() => { m.viewTransition = v; });
        }),
        el('button', {
            type: 'button', className: 'actionBtn', textContent: 'Test View Transition Morph',
            onclick: () => runViewTransition(() => {
                const bodyEl = document.getElementById('ctStudioBody');
                if (bodyEl) bodyEl.style.opacity = bodyEl.style.opacity === '0.99' ? '1' : '0.99';
            })
        }),
        makeSelectRow('Modal Entrance Animation', MODAL_ANIMATIONS.map(v => ({ value: v, label: v })), m.modalAnimation, v => {
            void applyDraftUpdate(() => { m.modalAnimation = v; });
        }),
        makeSelectRow('Button Press Micro-Interaction', BUTTON_FEEDBACKS.map(v => ({ value: v, label: v })), m.buttonFeedback, v => {
            void applyDraftUpdate(() => { m.buttonFeedback = v; });
        }),
        makeSelectRow('Ambient Canvas GPU Motion', AMBIENT_MOTIONS.map(v => ({ value: v, label: v })), m.ambientMotion, v => {
            void applyDraftUpdate(() => { m.ambientMotion = v; });
        }),
        makeSelectRow('Android Notification Style', [
            { value: 'segmented', label: 'Segmented Bars' },
            { value: 'liquid', label: 'Liquid Wave' }
        ], studio.draft.notificationStyle, v => {
            void applyDraftUpdate(() => { studio.draft.notificationStyle = v; });
        }),
        makeSelectRow('Base Visualizer Renderer', VALID_THEME_IDS.map(id => ({ value: id, label: `${THEMES[id].name} Visualizer` })), studio.draft.baseTheme, v => {
            void applyDraftUpdate(() => { studio.draft.baseTheme = v; });
        })
    ]);

    grid.append(curveCard, morphCard);
    body.appendChild(grid);
}

async function exportThemeJson(ct, includeImages) {
    const embedded = {};
    if (includeImages) {
        for (const scope of ['canvas', 'panels', 'stage', 'chrome']) {
            const aid = ct.backgrounds?.[scope]?.imageAssetId;
            if (ct.backgrounds?.[scope]?.mode === 'image' && aid && !embedded[aid]) {
                const rec = await getThemeAsset(aid);
                if (rec?.blob) {
                    const dataUrl = await blobToDataUrl(rec.blob);
                    if (dataUrl.length <= 2 * 1024 * 1024) embedded[aid] = dataUrl;
                }
            }
        }
    }
    const json = serializeThemeForExport(ct, embedded);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${ct.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'custom-theme'}.cachymusic-theme.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function renderLibraryTab(body) {
    const importInput = el('input', { type: 'file', accept: '.json,application/json', style: 'display:none', 'aria-label': 'Import theme JSON file' });
    importInput.addEventListener('change', async () => {
        const file = importInput.files?.[0];
        importInput.value = '';
        if (!file) return;
        try {
            const text = await file.text();
            const { theme, assets } = parseImportedThemeJson(text);
            for (const [assetId, dataUrl] of Object.entries(assets)) {
                const blob = await dataUrlToBlob(dataUrl);
                await saveThemeAsset(assetId, blob);
            }
            const fixed = autoFixThemeContrast(theme);
            const saved = await saveCustomTheme(fixed);
            studio.draft = structuredClone(saved);
            studio.savedThemes = await listCustomThemes();
            await applyTheme(saved.id);
            renderStudioShell();
            showToast(`Imported custom theme "${saved.name}".`);
        } catch (err) {
            showToast(err?.message || 'Failed to import theme JSON.', true);
        }
    });

    const topCard = el('div', { className: 'ctCard' }, [
        el('h4', { textContent: 'Manage Saved Themes & Import / Export' }),
        importInput,
        el('div', { className: 'ctPillGroup' }, [
            el('button', { type: 'button', className: 'actionBtn primaryBtn', textContent: '+ New Blank Custom Theme', onclick: () => {
                studio.draft = createDefaultCustomTheme(`Custom ${studio.savedThemes.length + 1}`, 'default');
                studio.undoStack = [];
                studio.redoStack = [];
                void applyCustomTheme(studio.draft, { persist: false, previewOnly: true }).then(() => renderStudioShell());
            }}),
            el('button', { type: 'button', className: 'actionBtn', textContent: 'Import Theme JSON', onclick: () => importInput.click() }),
            el('button', { type: 'button', className: 'actionBtn', textContent: 'Export Current (Palette)', onclick: () => void exportThemeJson(studio.draft, false) }),
            el('button', { type: 'button', className: 'actionBtn', textContent: 'Export Current (Full Bundle)', onclick: () => void exportThemeJson(studio.draft, true) })
        ])
    ]);
    body.appendChild(topCard);

    const grid = el('div', { className: 'ctSectionGrid' });
    if (studio.savedThemes.length === 0) {
        grid.appendChild(el('p', { className: 'themeCardDesc', textContent: 'No saved custom themes yet. Click "Save & Apply" in the header to store your current design.' }));
    } else {
        for (const item of studio.savedThemes) {
            const isEditing = item.id === studio.draft.id;
            const card = el('div', { className: `ctLibraryCard ${isEditing ? 'active' : ''}` }, [
                el('div', { className: 'ctLibraryCardTop' }, [
                    el('strong', { textContent: item.name }),
                    el('span', { className: 'themeCardDesc', textContent: `${item.mode.toUpperCase()} · ${item.backgrounds.canvas.mode}` })
                ]),
                el('div', { className: 'ctLibraryCardActions' }, [
                    el('button', {
                        type: 'button', className: 'actionBtn primaryBtn', textContent: 'Load & Edit',
                        onclick: () => {
                            studio.draft = validateAndNormalizeCustomTheme(structuredClone(item));
                            studio.undoStack = [];
                            studio.redoStack = [];
                            void applyCustomTheme(studio.draft, { persist: false, previewOnly: true }).then(() => renderStudioShell());
                        }
                    }),
                    el('button', {
                        type: 'button', className: 'actionBtn', textContent: 'Duplicate',
                        onclick: async () => {
                            const copy = validateAndNormalizeCustomTheme({ ...structuredClone(item), id: generateCustomThemeId(), name: `${item.name} Copy` });
                            await saveCustomTheme(copy);
                            studio.savedThemes = await listCustomThemes();
                            await renderCustomThemeCardsInModal();
                            renderActiveTabBody();
                            showToast(`Duplicated "${item.name}".`);
                        }
                    }),
                    el('button', {
                        type: 'button', className: 'actionBtn dangerBtn', textContent: 'Delete',
                        onclick: async () => {
                            const wasActive = store.state.activeTheme === item.id;
                            await deleteCustomTheme(item.id);
                            studio.savedThemes = await listCustomThemes();
                            if (wasActive) await applyTheme('default');
                            await renderCustomThemeCardsInModal();
                            renderActiveTabBody();
                            showToast(`Deleted "${item.name}".`);
                        }
                    })
                ])
            ]);
            grid.appendChild(card);
        }
    }
    body.appendChild(grid);
}

function renderActiveTabBody() {
    const body = document.getElementById('ctStudioBody');
    if (!body || !studio.draft) return;
    body.replaceChildren();
    switch (studio.activeTab) {
        case 'backgrounds': renderBackgroundsTab(body); break;
        case 'geometry': renderGeometryTab(body); break;
        case 'typography': renderTypographyTab(body); break;
        case 'motion': renderMotionTab(body); break;
        case 'library': renderLibraryTab(body); break;
        case 'colors':
        default: renderColorsTab(body); break;
    }
}

function renderStudioShell() {
    const { backdrop, card } = modalEls();
    if (!backdrop || !card || !studio.draft) return;

    const nameInput = el('input', {
        id: 'ctThemeNameInput',
        type: 'text',
        className: 'ctStudioNameInput',
        value: studio.draft.name,
        maxlength: '48',
        'aria-label': 'Custom theme name'
    });
    nameInput.addEventListener('input', () => {
        if (studio.draft) studio.draft.name = nameInput.value.slice(0, 48);
    });

    const header = el('div', { className: 'ctStudioHeader' }, [
        el('div', { className: 'ctStudioNameWrap' }, [
            el('h3', { id: 'customThemeStudioTitle', textContent: 'Theme Studio', style: 'margin:0;white-space:nowrap;' }),
            nameInput
        ]),
        el('div', { className: 'ctStudioHeaderActions' }, [
            el('button', { id: 'ctUndoBtn', type: 'button', className: 'actionBtn', textContent: 'Undo', onclick: () => void undoThemeStudio() }),
            el('button', { id: 'ctRedoBtn', type: 'button', className: 'actionBtn', textContent: 'Redo', onclick: () => void redoThemeStudio() }),
            el('button', {
                type: 'button',
                className: `actionBtn ${studio.isPeek ? 'active' : ''}`,
                textContent: studio.isPeek ? 'Back to Editor' : 'Peek App',
                onclick: () => {
                    studio.isPeek = !studio.isPeek;
                    backdrop.classList.toggle('ct-peek-mode', studio.isPeek);
                    renderStudioShell();
                }
            }),
            el('button', {
                type: 'button', className: 'actionBtn primaryBtn', textContent: 'Save & Apply',
                onclick: async () => {
                    studio.draft.name = String(studio.draft.name || '').trim() || 'Custom Studio';
                    const saved = await saveCustomTheme(studio.draft);
                    studio.draft = structuredClone(saved);
                    studio.savedThemes = await listCustomThemes();
                    studio.originalSnapshot = null;
                    await applyCustomTheme(saved, { persist: true });
                    updateActiveThemeIndicators(saved.id, `${saved.name} (Custom)`);
                    await renderCustomThemeCardsInModal();
                    showToast(`Saved custom theme "${saved.name}".`);
                    closeCustomThemeStudio({ discardPreview: false });
                }
            }),
            el('button', {
                type: 'button', className: 'actionBtn', textContent: 'Close', 'aria-label': 'Close Theme Studio',
                onclick: () => closeCustomThemeStudio({ discardPreview: true })
            })
        ])
    ]);

    const contrastBar = el('div', { className: 'ctContrastBar' }, [
        el('div', { id: 'ctContrastMeters', className: 'ctContrastMeters' }),
        el('button', {
            type: 'button', className: 'actionBtn', textContent: 'Auto-Fix Contrast',
            onclick: () => {
                void applyDraftUpdate(t => {
                    const fixed = autoFixThemeContrast(t);
                    t.colors = fixed.colors;
                    t.backgrounds = fixed.backgrounds;
                }, { reRenderBody: true });
                showToast('FG / MG / BG contrast repaired to WCAG 2.2 AA+.');
            }
        })
    ]);

    const tabStrip = el('div', { className: 'ctStudioTabs', role: 'tablist', 'aria-label': 'Theme Studio sections' }, TABS.map(tab =>
        el('button', {
            type: 'button',
            role: 'tab',
            className: `ctStudioTabBtn ${studio.activeTab === tab.id ? 'active' : ''}`,
            'aria-selected': String(studio.activeTab === tab.id),
            textContent: tab.label,
            onclick: () => {
                studio.activeTab = tab.id;
                for (const b of tabStrip.children) {
                    const active = b.textContent === tab.label;
                    b.classList.toggle('active', active);
                    b.setAttribute('aria-selected', String(active));
                }
                renderActiveTabBody();
            }
        })
    ));

    const body = el('div', { id: 'ctStudioBody', className: 'ctStudioBody' });
    card.replaceChildren(header, contrastBar, tabStrip, body);
    updateHeaderAndContrast();
    renderActiveTabBody();
}

export async function openCustomThemeStudio(themeIdOrBase = null) {
    const { backdrop } = modalEls();
    if (!backdrop) return;
    if (!studio.isOpen && typeof document !== 'undefined') {
        studio.triggerEl = document.activeElement;
    }

    studio.savedThemes = await listCustomThemes();
    const currentId = store.state.activeTheme || 'default';
    studio.originalSnapshot = {
        activeTheme: currentId,
        custom: getActiveCustomTheme() ? structuredClone(getActiveCustomTheme()) : null
    };

    if (typeof themeIdOrBase === 'string' && themeIdOrBase.startsWith('custom:')) {
        const existing = await getCustomTheme(themeIdOrBase);
        studio.draft = existing ? structuredClone(existing) : createDefaultCustomTheme('Custom Studio', 'default');
    } else if (getActiveCustomTheme() && document.documentElement.dataset.theme === 'custom' && !themeIdOrBase) {
        studio.draft = structuredClone(getActiveCustomTheme());
    } else {
        const base = typeof themeIdOrBase === 'string' && VALID_THEME_IDS.includes(themeIdOrBase)
            ? themeIdOrBase
            : (VALID_THEME_IDS.includes(currentId) ? currentId : 'default');
        studio.draft = createDefaultCustomTheme(`Custom ${studio.savedThemes.length + 1}`, base);
    }

    studio.undoStack = [];
    studio.redoStack = [];
    studio.isPeek = false;
    studio.isOpen = true;
    backdrop.classList.remove('ct-peek-mode');
    backdrop.style.display = 'flex';
    pushModalState('customThemeStudioModal');

    await applyCustomTheme(studio.draft, { persist: false, previewOnly: true });
    renderStudioShell();
    document.getElementById('ctThemeNameInput')?.focus({ preventScroll: true });
}

export async function closeCustomThemeStudio({ discardPreview = true } = {}) {
    const { backdrop } = modalEls();
    if (!backdrop || !studio.isOpen) return;
    studio.isOpen = false;
    studio.isPeek = false;
    backdrop.classList.remove('ct-peek-mode');
    backdrop.style.display = 'none';

    if (discardPreview && studio.originalSnapshot) {
        if (studio.originalSnapshot.custom) {
            await applyCustomTheme(studio.originalSnapshot.custom, { persist: true });
        } else {
            await applyTheme(studio.originalSnapshot.activeTheme || 'default');
        }
    }
    studio.originalSnapshot = null;
    studio.draft = null;
    studio.undoStack = [];
    studio.redoStack = [];
    studio.triggerEl?.focus?.({ preventScroll: true });
    if (history.state?.cachyModal === 'customThemeStudioModal') {
        popModalState('customThemeStudioModal');
    }
}

export function isCustomThemeStudioOpen() {
    return studio.isOpen;
}
