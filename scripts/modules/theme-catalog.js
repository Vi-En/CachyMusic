// Stable IDs are persisted by web and Android clients; labels may evolve.
export const THEMES = Object.freeze({
    "default": Object.freeze({name: "Studio", chrome: "#090e14", description: "Brushed metal, clean controls and a silver record dial."}),
    "carbon-signal": Object.freeze({name: "Carbon Signal", chrome: "#0B0F12", description: "Precision studio with 1px structural framing and restrained teal accents."}),
    "paper-sonata": Object.freeze({name: "Paper Sonata", chrome: "#F6F1E7", description: "Editorial light collection with serif headings and warm burgundy ink."}),
    "blue-note-console": Object.freeze({name: "Blue Note Console", chrome: "#07111F", description: "Broadcast workstation in deep navy with grouped signal readouts."}),
    "copper-reel": Object.freeze({name: "Copper Reel", chrome: "#18120F", description: "Warm dark analog aesthetic with matte copper cards and inset metadata."}),
    "orchid-matrix": Object.freeze({name: "Orchid Matrix", chrome: "#100D16", description: "Modular creative workspace with generous panels and violet common regions."}),
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
export const SYSTEM_THEME_PAIR = Object.freeze({ light: 'paper-sonata', dark: 'carbon-signal' });
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

export const THEME_VISUAL_PROFILES = Object.freeze({
    "default": Object.freeze({ style: "segmented", accent: "#38bdf8", secondary: "#94a3b8", light: false }),
    "carbon-signal": Object.freeze({ style: "segmented", accent: "#4FD1C5", secondary: "#B7C4CA", light: false }),
    "paper-sonata": Object.freeze({ style: "segmented", accent: "#8B2F3C", secondary: "#5E554B", light: true }),
    "blue-note-console": Object.freeze({ style: "segmented", accent: "#7CC4FF", secondary: "#B7C9DE", light: false }),
    "copper-reel": Object.freeze({ style: "liquid", accent: "#E8A06B", secondary: "#D8C2B0", light: false }),
    "orchid-matrix": Object.freeze({ style: "liquid", accent: "#D0A2FF", secondary: "#C9BBDD", light: false }),
    "nms": Object.freeze({ style: "liquid", accent: "#ff2a55", secondary: "#00e5ff", light: false }),
    "solar-eclipse": Object.freeze({ style: "liquid", accent: "#38d9ff", secondary: "#a855f7", light: false }),
    "euclid-horizon": Object.freeze({ style: "segmented", accent: "#f59e0b", secondary: "#fbbf24", light: false }),
    "alien-paradise": Object.freeze({ style: "liquid", accent: "#ff4da6", secondary: "#2dd4bf", light: false }),
    "abyssal-void": Object.freeze({ style: "liquid", accent: "#10f5a8", secondary: "#0ea5e9", light: false }),
    "dissonance": Object.freeze({ style: "liquid", accent: "#c084fc", secondary: "#f472b6", light: false }),
    "sentinel": Object.freeze({ style: "segmented", accent: "#00e5ff", secondary: "#f97316", light: false }),
    "minimalist-light": Object.freeze({ style: "segmented", accent: "#111827", secondary: "#6b7280", light: true }),
    "minimalist-dark": Object.freeze({ style: "segmented", accent: "#f3f4f6", secondary: "#9ca3af", light: false }),
    "minimalist-warm": Object.freeze({ style: "liquid", accent: "#9a3412", secondary: "#d97706", light: true }),
    "minimalist-obsidian": Object.freeze({ style: "segmented", accent: "#22d3ee", secondary: "#38bdf8", light: false }),
});

export function getThemeNotificationProfile(themeId) {
    const id = normalizeThemeId(themeId);
    const base = THEMES[id];
    const visual = THEME_VISUAL_PROFILES[id];
    return {
        id,
        name: base.name,
        chrome: base.chrome,
        style: visual.style,
        accent: visual.accent,
        secondary: visual.secondary,
        light: visual.light,
    };
}