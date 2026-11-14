// CachyMusic - Utilities & Performance Shields

    // Cross-Browser Engine Optimization & Safe Storage Initialization
    const isFirefox = typeof navigator !== 'undefined' && /firefox|fxios/i.test(navigator.userAgent);
    if (isFirefox && typeof document !== 'undefined' && document.documentElement) {
        document.documentElement.classList.add('is-firefox');
    }

    const _storageMemFallback = {};
    const safeStorage = {
        getItem: function(key) {
            try {
                if (typeof window !== 'undefined' && window.localStorage) {
                    const v = window.localStorage.getItem(key);
                    if (v !== null) return v;
                }
            } catch (_) {}
            try {
                if (typeof window !== 'undefined' && window.sessionStorage) {
                    const v = window.sessionStorage.getItem(key);
                    if (v !== null) return v;
                }
            } catch (_) {}
            try {
                const match = document.cookie.match(new RegExp('(?:^|;\\s*)' + key + '=([^;]+)'));
                if (match) return decodeURIComponent(match[1]);
            } catch (_) {}
            return _storageMemFallback[key] !== undefined ? _storageMemFallback[key] : null;
        },
        setItem: function(key, val) {
            const str = String(val);
            _storageMemFallback[key] = str;
            try {
                if (typeof window !== 'undefined' && window.localStorage) {
                    window.localStorage.setItem(key, str);
                }
            } catch (_) {}
            try {
                if (typeof window !== 'undefined' && window.sessionStorage) {
                    window.sessionStorage.setItem(key, str);
                }
            } catch (_) {}
            try {
                document.cookie = key + '=' + encodeURIComponent(str) + '; path=/; max-age=31536000; SameSite=Lax';
            } catch (_) {}
        },
        removeItem: function(key) {
            delete _storageMemFallback[key];
            try {
                if (typeof window !== 'undefined' && window.localStorage) {
                    window.localStorage.removeItem(key);
                }
            } catch (_) {}
            try {
                if (typeof window !== 'undefined' && window.sessionStorage) {
                    window.sessionStorage.removeItem(key);
                }
            } catch (_) {}
            try {
                document.cookie = key + '=; path=/; max-age=0; SameSite=Lax';
            } catch (_) {}
        }
    };

    // Universal Cross-Browser 2D Canvas Performance Shield:
    // In Gecko/Firefox, CanvasRenderingContext2D.shadowBlur triggers a synchronous CPU-side
    // Gaussian blur convolution filter, dropping frame rates to 15-20 FPS with 100% core usage.
    // In Chromium and WebKit, heavy shadowBlur (>4px) on large rotating shockwaves and platters
    // creates massive GPU fill-rate stalls and micro-stutters.
    // By clamping shadowBlur to 0 on Firefox and a safe maximum of 3px on Chromium/WebKit,
    // we achieve a flat 60-144 FPS across Chrome, Brave, Firefox, Edge, Safari, and mobile.
    const isMobileDevice = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || ('ontouchstart' in window && window.innerWidth <= 768);
    if (typeof CanvasRenderingContext2D !== 'undefined') {
        try {
            const origShadowBlurDesc = Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, 'shadowBlur');
            if (origShadowBlurDesc && origShadowBlurDesc.set) {
                let currentShadowBlur = 0;
                Object.defineProperty(CanvasRenderingContext2D.prototype, 'shadowBlur', {
                    get: function() { return currentShadowBlur; },
                    set: function(val) {
                        const num = Number(val) || 0;
                        currentShadowBlur = (isFirefox || isMobileDevice) ? 0 : Math.min(Math.max(0, num), 3);
                        origShadowBlurDesc.set.call(this, currentShadowBlur);
                    },
                    configurable: true,
                    enumerable: true
                });
            }
        } catch (_) {}
    }



    function formatTime(seconds) {
        if (!seconds || isNaN(seconds) || !isFinite(seconds) || seconds < 0) return '0:00';
        const hrs = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        if (hrs > 0) {
            return `${hrs}:${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
        }
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    }

    function escapeHtml(str) {
        return (str || '').toString().replace(/[&<>"']/g, function(m) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
        });
    }

    function escapeRegex(str) {
        return (str || '').toString().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function formatFileSize(bytes) {
        if (!bytes) return 'N/A';
        if (bytes >= 1048576) return (bytes / 1048576).toFixed(2) + ' MB';
        return (bytes / 1024).toFixed(1) + ' KB';
    }

    // Scan Directory via Server API

    function showToast(message, actionText = null, actionCallback = null, duration = 3500) {
        let container = document.getElementById('cachyToastContainer');
        if (!container) {
            container = document.createElement('div');
            container.id = 'cachyToastContainer';
            container.className = 'toastContainer';
            document.body.appendChild(container);
        }

        const toast = document.createElement('div');
        toast.className = 'cachyToast';

        const msgSpan = document.createElement('span');
        msgSpan.className = 'toastMsg';
        msgSpan.textContent = message;
        toast.appendChild(msgSpan);

        if (actionText && typeof actionCallback === 'function') {
            const actBtn = document.createElement('button');
            actBtn.type = 'button';
            actBtn.className = 'toastUndoBtn';
            actBtn.textContent = actionText;
            actBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                try { actionCallback(); } catch (err) { console.warn('Toast action error:', err); }
                toast.style.opacity = '0';
                toast.style.transform = 'translateY(10px)';
                setTimeout(() => toast.remove(), 200);
            });
            toast.appendChild(actBtn);
        }

        container.appendChild(toast);

        setTimeout(() => {
            if (toast.parentNode) {
                toast.style.opacity = '0';
                toast.style.transform = 'translateY(10px)';
                setTimeout(() => toast.remove(), 200);
            }
        }, duration);
    }

    function showCachyToast(title, message = '', _level = 'info') {
        const text = message ? `${title}: ${message}` : String(title || '');
        showToast(text);
    }

    function setScanStatus(msg, isError = false) {
        if (typeof document === 'undefined') return;
        const scanStatusEl = document.getElementById('scanStatus');
        if (scanStatusEl) {
            scanStatusEl.textContent = msg;
            scanStatusEl.style.color = isError ? '#ff4d4d' : 'var(--text-secondary, #888888)';
        }
        const settingsTabScanStatus = document.getElementById('settingsTabScanStatus');
        if (settingsTabScanStatus) {
            settingsTabScanStatus.textContent = msg;
            settingsTabScanStatus.style.color = isError ? '#ff4d4d' : 'var(--accent-color, #00f0ff)';
        }
    }

    function pushModalState(modalId) {
        try {
            if (typeof history !== 'undefined' && typeof history.pushState === 'function') {
                history.pushState({ cachyModal: modalId }, '');
            }
        } catch (_) {}
    }

    function popModalState(modalId) {
        try {
            if (typeof history !== 'undefined' && history.state && history.state.cachyModal === modalId) {
                history.back();
            }
        } catch (_) {}
    }

    function getValidSampleRate(rate) {
        const r = Number(rate);
        const validRates = [44100, 48000, 88200, 96000, 176400, 192000];
        if (validRates.includes(r)) return r;
        return 44100;
    }

    export {
        isFirefox,
        isMobileDevice,
        safeStorage,
        escapeHtml,
        escapeRegex,
        formatTime,
        formatFileSize,
        showToast,
        showCachyToast,
        setScanStatus,
        pushModalState,
        popModalState,
        getValidSampleRate
    };

