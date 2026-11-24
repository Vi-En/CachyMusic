// A single lazy renderer per saved theme. No theme code loads in artwork mode.
import { normalizeThemeId } from '../theme-catalog.js';

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
    const id = normalizeThemeId(theme);
    if (!pending.has(id)) {
        pending.set(id, loaders[id]().catch(error => { pending.delete(id); throw error; }));
    }
    return pending.get(id);
}
