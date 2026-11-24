// Stable IDs are persisted by web and Android clients; labels may evolve.
export const THEMES = Object.freeze({
    "default": Object.freeze({name: "Studio", chrome: "#090e14", description: "Brushed metal, clean controls and a silver record dial."}),
    "nms": Object.freeze({name: "Crimson", chrome: "#15080a", description: "Red instrument glass and a faceted, reactive core."}),
    "solar-eclipse": Object.freeze({name: "Orbit", chrome: "#0a0b1a", description: "Deep blue, orbital rings and a luminous planet."}),
    "euclid-horizon": Object.freeze({name: "Station", chrome: "#120e09", description: "Warm metal, architectural lines and a docking ring."}),
    "alien-paradise": Object.freeze({name: "Bloom", chrome: "#140912", description: "Retro pink and turquoise with organic, fluid forms."}),
    "abyssal-void": Object.freeze({name: "Jade", chrome: "#06140f", description: "Deep green with a crescent and a radial instrument dial."}),
    "dissonance": Object.freeze({name: "Amethyst", chrome: "#12081c", description: "Violet light, faceted crystal and angular detailing."}),
    "sentinel": Object.freeze({name: "Alloy", chrome: "#09111a", description: "Brushed metal, precise divisions and twin radiator banks."}),
    "minimalist-light": Object.freeze({name: "Paper", chrome: "#f4f3ef", description: "White editorial layout and an ink spectrum."}),
    "minimalist-dark": Object.freeze({name: "Graphite", chrome: "#080808", description: "Matte charcoal and a segmented meter."}),
    "minimalist-warm": Object.freeze({name: "Sleeve", chrome: "#faf8f5", description: "Warm paper, serif type and a printed record label."}),
    "minimalist-obsidian": Object.freeze({name: "Midnight", chrome: "#000000", description: "True black with sparse cyan lines and a radial spectrum."}),
});
export const VALID_THEME_IDS = Object.freeze(Object.keys(THEMES));
const THEME_ALIASES = new Map([
    ['atlas', 'nms'], ['spotify', 'nms'], ['apple', 'nms'],
    ['studio-dark', 'default'], ['cyberpunk', 'solar-eclipse'], ['neon-night', 'solar-eclipse'],
    ['brutalist-minimalism-light', 'minimalist-light'], ['brutalist-light', 'minimalist-light'],
    ['brutalist-minimalism-dark', 'minimalist-dark'], ['brutalist-dark', 'minimalist-dark'],
    ['midnight-amoled', 'minimalist-obsidian']
]);


export function normalizeThemeId(value) {
    const id = THEME_ALIASES.get(value) || value;
    return VALID_THEME_IDS.includes(id) ? id : "default";
}
