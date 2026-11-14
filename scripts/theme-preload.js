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
    } catch (_) {}
})();
