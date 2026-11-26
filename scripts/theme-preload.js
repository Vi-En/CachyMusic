// CachyMusic v3.0.0 — Pre-Paint Theme & Engine Bootstrap (Zero FOUC)
(function () {
    try {
        // Remove legacy CachyMusic cookies; preferences are now browser-local only.
        try {
            document.cookie.split(';').forEach(function (entry) {
                var name = entry.split('=')[0].trim();
                if (/^cachymusic_[A-Za-z0-9_-]+$/.test(name)) {
                    document.cookie = name + '=; path=/; max-age=0; SameSite=Lax';
                }
            });
        } catch (_) {}

        var root = document.documentElement;
        if (/firefox|fxios/i.test(navigator.userAgent)) {
            root.classList.add('is-firefox');
        }
        var urlT = null;
        try {
            urlT = new URLSearchParams(window.location.search).get('theme');
        } catch (_) {}
        var savedT = null;
        try { savedT = window.AndroidBridge?.getSavedTheme?.(); } catch (_) {}
        if (!savedT) {
            try { if (window.localStorage) savedT = localStorage.getItem('cachymusic_active_theme'); } catch (_) {}
        }
        if (!savedT) {
            try { if (window.sessionStorage) savedT = sessionStorage.getItem('cachymusic_active_theme'); } catch (_) {}
        }

        var t = urlT || savedT || 'default';
        var valid = [
            'default', 'nms', 'solar-eclipse', 'euclid-horizon', 'alien-paradise',
            'abyssal-void', 'dissonance', 'sentinel',
            'minimalist-light', 'minimalist-dark', 'minimalist-warm', 'minimalist-obsidian'
        ];
        var metaTheme = document.querySelector('meta[name="theme-color"]');

        // Hydrate saved Custom Theme snapshot synchronously before first paint when active
        if (!urlT && typeof t === 'string' && (t === 'custom' || t.indexOf('custom:') === 0)) {
            try {
                var snapRaw = window.localStorage ? localStorage.getItem('cachymusic_custom_theme_snapshot') : null;
                var snap = snapRaw ? JSON.parse(snapRaw) : null;
                if (snap && snap.v === 1 && snap.vars && typeof snap.vars === 'object' && (!snap.id || t === 'custom' || snap.id === t)) {
                    var rootStyle = root.style;
                    if (rootStyle && typeof rootStyle.setProperty === 'function') {
                        Object.keys(snap.vars).forEach(function (prop) {
                            if (typeof prop === 'string' && prop.indexOf('--') === 0) {
                                var val = String(snap.vars[prop]);
                                if (val.length < 180 && !/(?:expression\(|javascript:|url\(|<|>|;)/i.test(val)) {
                                    rootStyle.setProperty(prop, val);
                                }
                            }
                        });
                    }
                    root.setAttribute('data-theme', 'custom');
                    if (snap.id && typeof root.setAttribute === 'function') {
                        root.setAttribute('data-custom-theme-id', String(snap.id));
                    }
                    if (metaTheme && /^#[0-9a-f]{6}$/i.test(String(snap.chrome || ''))) {
                        metaTheme.setAttribute('content', snap.chrome);
                    }
                    return;
                }
            } catch (_) {}
            t = 'default';
        }

        if (t === 'atlas' || t === 'spotify' || t === 'apple') t = 'nms';
        if (t === 'studio-dark') t = 'default';
        if (t === 'cyberpunk' || t === 'neon-night') t = 'solar-eclipse';
        if (t === 'midnight-amoled') t = 'minimalist-obsidian';
        if (t === 'brutalist-minimalism-light' || t === 'brutalist-light') t = 'minimalist-light';
        if (t === 'brutalist-minimalism-dark' || t === 'brutalist-dark') t = 'minimalist-dark';

        if (!valid.includes(t)) {
            t = 'default';
        }
        try { if (window.localStorage) localStorage.setItem('cachymusic_active_theme', t); } catch (_) {}
        try { if (window.sessionStorage) sessionStorage.setItem('cachymusic_active_theme', t); } catch (_) {}
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
        if (metaTheme && themeMetaColors[t]) {
            metaTheme.setAttribute('content', themeMetaColors[t]);
        }
    } catch (_) {}
})();
