// CachyMusic v2.0.0 — Pre-Paint Theme & Engine Bootstrap (Zero FOUC)
(function () {
    try {
        var root = document.documentElement;
        if (/firefox|fxios/i.test(navigator.userAgent)) {
            root.classList.add('is-firefox');
        }
        var urlT = null;
        try {
            urlT = new URLSearchParams(window.location.search).get('theme');
        } catch (_) {}
        var savedT = null;
        try { if (window.localStorage) savedT = localStorage.getItem('cachymusic_active_theme'); } catch (_) {}
        if (!savedT) {
            try { if (window.sessionStorage) savedT = sessionStorage.getItem('cachymusic_active_theme'); } catch (_) {}
        }
        if (!savedT) {
            try {
                var m = document.cookie.match(/(?:^|;\s*)cachymusic_active_theme=([^;]+)/);
                if (m) savedT = decodeURIComponent(m[1]);
            } catch (_) {}
        }

        var t = urlT || savedT || 'default';
        if (t === 'brutalist-minimalism-light' || t === 'brutalist-light') t = 'minimalist-light';
        if (t === 'brutalist-minimalism-dark' || t === 'brutalist-dark') t = 'minimalist-dark';
        var valid = [
            'default', 'nms', 'solar-eclipse', 'euclid-horizon', 'alien-paradise',
            'abyssal-void', 'dissonance', 'sentinel',
            'minimalist-light', 'minimalist-dark', 'minimalist-warm', 'minimalist-obsidian',
            'brutalist-light', 'brutalist-dark', 'studio-dark', 'cyberpunk', 'neon-night', 'midnight-amoled'
        ];
        if (!valid.includes(t)) {
            t = (t === 'spotify' || t === 'apple' || t === 'atlas') ? 'nms' : 'default';
        }
        try { if (window.localStorage) localStorage.setItem('cachymusic_active_theme', t); } catch (_) {}
        try { if (window.sessionStorage) sessionStorage.setItem('cachymusic_active_theme', t); } catch (_) {}
        try { document.cookie = 'cachymusic_active_theme=' + encodeURIComponent(t) + '; path=/; max-age=31536000; SameSite=Lax'; } catch (_) {}
        root.setAttribute('data-theme', t);
        var themeMetaColors = {
            default: '#090e14', 'studio-dark': '#090e14',
            nms: '#15080a', atlas: '#15080a',
            'solar-eclipse': '#0a0b1a', cyberpunk: '#0a0b1a', 'neon-night': '#0a0b1a',
            'euclid-horizon': '#120e09',
            'alien-paradise': '#140912',
            'abyssal-void': '#06140f',
            dissonance: '#12081c',
            sentinel: '#09111a',
            'minimalist-light': '#f4f3ef', 'brutalist-light': '#f4f3ef',
            'minimalist-dark': '#080808', 'brutalist-dark': '#080808',
            'minimalist-warm': '#faf8f5',
            'minimalist-obsidian': '#000000', 'midnight-amoled': '#000000'
        };
        var metaTheme = document.querySelector('meta[name="theme-color"]');
        if (metaTheme && themeMetaColors[t]) {
            metaTheme.setAttribute('content', themeMetaColors[t]);
        }
    } catch (_) {}
})();
