// A single lazy renderer per saved theme. No theme code loads in artwork mode.
import { VALID_THEME_IDS, normalizeThemeId } from '../theme-catalog.js';
import { getActiveCustomTheme } from '../custom-theme-engine.js';

const loaders = {
    'default': () => import('./studio.js'),
    'nms': () => import('./crimson.js'),
    'solar-eclipse': () => import('./orbit.js'),
    'euclid-horizon': () => import('./station.js'),
    'alien-paradise': () => import('./bloom.js'),
    'abyssal-void': () => import('./jade.js'),
    'dissonance': () => import('./amethyst.js'),
    'sentinel': () => import('./alloy.js'),
    'minimalist-light': () => import('./paper.js'),
    'minimalist-dark': () => import('./graphite.js'),
    'minimalist-warm': () => import('./sleeve.js'),
    'minimalist-obsidian': () => import('./midnight.js'),
};
const pending = new Map();
export function loadCore(theme) {
    let resolved = theme;
    if (resolved === 'custom' || (typeof resolved === 'string' && resolved.startsWith('custom:'))) {
        resolved = getActiveCustomTheme()?.baseTheme || 'default';
    }
    const id = VALID_THEME_IDS.includes(resolved) ? resolved : normalizeThemeId(resolved);
    if (!pending.has(id)) {
        pending.set(id, loaders[id]().catch(error => { pending.delete(id); throw error; }));
    }
    return pending.get(id);
}
