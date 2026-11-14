// CachyMusic - Theme Palette & Ambient Aura Engine
import { popModalState, pushModalState, safeStorage } from './utils.js';
import { VALID_THEME_IDS, store } from './state.js';
import {
    themeModal,
    themeQuickBtns,
    themeSelectCards,
    topThemeLabel,
    turntableCenterVis,
    vinylLabel,
    vinylTurntable
} from './ui-elements.js';

    const ambientColorCache = new Map();

    function updateAmbientLighting(coverUrl) {
        if (!coverUrl) return;

        if (ambientColorCache.has(coverUrl)) {
            const [c1, c2] = ambientColorCache.get(coverUrl);
            document.documentElement.style.setProperty('--ambient-aura-1', c1);
            document.documentElement.style.setProperty('--ambient-aura-2', c2);
            return;
        }

        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            try {
                if (!store.state.ambientCanvas) {
                    const canvas = document.createElement('canvas');
                    canvas.width = 16;
                    canvas.height = 16;
                    store.state.ambientCanvas = canvas;
                    store.state.ambientCtx = canvas.getContext('2d', { willReadFrequently: true });
                }
                const ambientCtx = store.state.ambientCtx;
                if (!ambientCtx) return;
                ambientCtx.drawImage(img, 0, 0, 16, 16);
                const imgData = ambientCtx.getImageData(0, 0, 16, 16).data;

                let rSum = 0, gSum = 0, bSum = 0, count = 0;
                let maxSat = -1;
                let satR = 230, satG = 20, satB = 20;

                for (let i = 0; i < imgData.length; i += 4) {
                    const r = imgData[i];
                    const g = imgData[i + 1];
                    const b = imgData[i + 2];
                    const a = imgData[i + 3];
                    if (a < 128) continue;

                    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
                    if (lum > 25 && lum < 235) {
                        rSum += r;
                        gSum += g;
                        bSum += b;
                        count++;

                        const max = Math.max(r, g, b);
                        const min = Math.min(r, g, b);
                        const sat = (max - min) / (max || 1);
                        if (sat > maxSat) {
                            maxSat = sat;
                            satR = r;
                            satG = g;
                            satB = b;
                        }
                    }
                }

                let secR = satR, secG = satG, secB = satB;
                if (count > 0) {
                    secR = Math.round(rSum / count);
                    secG = Math.round(gSum / count);
                    secB = Math.round(bSum / count);
                }

                const c1 = `rgba(${satR}, ${satG}, ${satB}, 0.22)`;
                const c2 = `rgba(${secR}, ${secG}, ${secB}, 0.05)`;

                ambientColorCache.set(coverUrl, [c1, c2]);
                document.documentElement.style.setProperty('--ambient-aura-1', c1);
                document.documentElement.style.setProperty('--ambient-aura-2', c2);
            } catch (_) {}
        };
        img.src = coverUrl;
    }


    function applyTheme(themeName, showToastNotification = false) {
        if (themeName === 'atlas' || themeName === 'spotify' || themeName === 'apple') {
            themeName = 'nms';
        } else if (themeName === 'brutalist-minimalism-light' || themeName === 'brutalist-light') {
            themeName = 'minimalist-light';
        } else if (themeName === 'brutalist-minimalism-dark' || themeName === 'brutalist-dark') {
            themeName = 'minimalist-dark';
        }
        if (!VALID_THEME_IDS.includes(themeName)) {
            themeName = 'default';
        }
        store.setState({ activeTheme: themeName }, ['theme:change']);
        if (showToastNotification) {
            store.emit('theme:loading', { themeName });
        }
        document.documentElement.setAttribute('data-theme', themeName);
        document.body.removeAttribute('data-theme');
        try {
            safeStorage.setItem('cachymusic_active_theme', themeName);
            localStorage.setItem('cachymusic_active_theme', themeName);
        } catch (_) {}

        try {
            if (typeof window !== 'undefined' && window.history && window.history.replaceState) {
                const currentUrl = new URL(window.location.href);
                if (currentUrl.searchParams.has('theme') && currentUrl.searchParams.get('theme') !== themeName) {
                    currentUrl.searchParams.set('theme', themeName);
                    window.history.replaceState(null, '', currentUrl.pathname + currentUrl.search + currentUrl.hash);
                }
            }
        } catch (_) {}

        // Update active class on Theme Modal cards
        themeSelectCards.forEach(card => {
            const isTarget = card.dataset.theme === themeName;
            card.classList.toggle('active', isTarget);
        });

        // Update active class on Settings Panel quick buttons
        themeQuickBtns.forEach(btn => {
            const isTarget = btn.dataset.theme === themeName;
            btn.classList.toggle('active', isTarget);
        });

        // Update Top Navigation Bar label
        if (topThemeLabel) {
            const labels = {
                default: 'DEFAULT',
                nms: 'THE ATLAS',
                'solar-eclipse': 'PLANETARY WARP',
                'euclid-horizon': 'SPACE STATION',
                'alien-paradise': 'ALIEN PARADISE',
                'abyssal-void': 'EMERIL DRIVE',
                dissonance: 'DISSONANCE',
                sentinel: 'SENTINEL',
                'minimalist-light': 'MINIMALIST (LIGHT)',
                'minimalist-dark': 'MINIMALIST (DARK)',
                'minimalist-warm': 'MINIMALIST (WARM)',
                'minimalist-obsidian': 'MINIMALIST (OLED)',
                'brutalist-light': 'MINIMALIST (LIGHT)',
                'brutalist-dark': 'MINIMALIST (DARK)'
            };
            topThemeLabel.textContent = labels[themeName] || 'THEMES';
        }

        // Update Settings Panel Theme Status
        const settingsThemeLabel = document.getElementById('settingsThemeCurrentLabel');
        if (settingsThemeLabel) {
            const friendly = {
                default: 'Default Studio Hi-Fi • Precision Noir',
                nms: 'The Atlas • Crimson Core HUD',
                'solar-eclipse': 'Planetary Warp • Corona Orbit',
                'euclid-horizon': 'Space Station • Euclid Dock',
                'alien-paradise': 'Alien Paradise • 70s Retro Flora',
                'abyssal-void': 'Emeril Drive • Emerald Pulse',
                dissonance: 'Dissonance • Corrupted Atlantideum',
                sentinel: 'Sentinel • Defense Combat Interface',
                'minimalist-light': 'Minimalist (Light) • Stark Paper Clarity',
                'minimalist-dark': 'Minimalist (Dark) • Monolithic Slate Void',
                'minimalist-warm': 'Minimalist (Warm Paper) • Nordic Alabaster & Amber',
                'minimalist-obsidian': 'Minimalist (Obsidian OLED) • Pitch Pure Zero-Watt',
                'brutalist-light': 'Minimalist (Light) • Stark Paper Clarity',
                'brutalist-dark': 'Minimalist (Dark) • Monolithic Slate Void'
            };
            settingsThemeLabel.textContent = friendly[themeName] || themeName.toUpperCase();
        }

        const settingsTabCurrentThemeBadge = document.getElementById('settingsTabCurrentThemeBadge');
        if (settingsTabCurrentThemeBadge) {
            const labels = {
                default: 'DEFAULT STUDIO HI-FI',
                nms: 'THE ATLAS',
                'solar-eclipse': 'PLANETARY WARP',
                'euclid-horizon': 'SPACE STATION',
                'alien-paradise': 'ALIEN PARADISE',
                'abyssal-void': 'EMERIL DRIVE',
                dissonance: 'DISSONANCE',
                sentinel: 'SENTINEL',
                'minimalist-light': 'MINIMALIST (LIGHT)',
                'minimalist-dark': 'MINIMALIST (DARK)',
                'minimalist-warm': 'MINIMALIST (WARM PAPER)',
                'minimalist-obsidian': 'MINIMALIST (OBSIDIAN OLED)',
                'brutalist-light': 'MINIMALIST (LIGHT)',
                'brutalist-dark': 'MINIMALIST (DARK)'
            };
            settingsTabCurrentThemeBadge.textContent = labels[themeName] || themeName.toUpperCase();
        }

        // Sync turntable center visualizer and fidelity according to activeVisualizerMode
        const isThematicActive = (store.state.activeVisualizerMode === 'thematic' || store.state.activeVisualizerMode === 'badapple');
        if (turntableCenterVis) {
            turntableCenterVis.style.display = 'flex';
        }
        if (vinylLabel) {
            vinylLabel.style.opacity = '0';
        }
        if (vinylTurntable) {
            vinylTurntable.classList.toggle('thematicFidelity', isThematicActive);
            vinylTurntable.classList.toggle('spinning', store.state.isPlaying);
        }
        store.emit('ui:sync-signal-path');
        store.emit('ui:sync-dac-status');
        store.emit('peq:redraw');
        store.emit('visualizer:ensure-themes');
        store.emit('visualizer:resume');
    }

    function openThemeModal() {
        if (!themeModal) return;
        themeModal.style.display = 'flex';
        pushModalState('themeModal');
        setTimeout(() => {
            const activeCard = themeModal.querySelector('.themeSelectCard.active');
            if (activeCard) {
                activeCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }, 60);
    }

    function closeThemeModal() {
        if (themeModal) themeModal.style.display = 'none';
        popModalState('themeModal');
    }

    export {
        updateAmbientLighting,
        applyTheme,
        openThemeModal,
        closeThemeModal
    };

