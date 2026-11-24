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
        }
    };

    // Restrict costly visualizer blur without corrupting state shared by other
    // canvases. The native getter is essential: save()/restore() changes the
    // real context state without passing through the JavaScript setter.
    const isMobileDevice = /Android|iPhone|iPad|iPod|Mobile/i.test(typeof navigator !== 'undefined' ? navigator.userAgent : '') ||
        (typeof window !== 'undefined' && 'ontouchstart' in window && window.innerWidth <= 768);
    if (typeof CanvasRenderingContext2D !== 'undefined') {
        try {
            const desc = Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, 'shadowBlur');
            if (desc?.get && desc?.set) {
                Object.defineProperty(CanvasRenderingContext2D.prototype, 'shadowBlur', {
                    get() { return desc.get.call(this); },
                    set(value) {
                        const requested = Number(value);
                        const clamped = Number.isFinite(requested) ? Math.max(0, requested) : 0;
                        desc.set.call(this, (isFirefox || isMobileDevice) ? 0 : Math.min(clamped, 3));
                    },
                    configurable: true,
                    enumerable: desc.enumerable
                });
            }
        } catch (_) { /* Native prototype may be non-configurable. */ }
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
        if (bytes === null || bytes === undefined || bytes === '') return 'N/A';
        if (typeof bytes === 'string' && /[a-zA-Z]/.test(bytes)) return bytes;
        const n = Number(bytes);
        if (!Number.isFinite(n) || n <= 0) return 'N/A';
        if (n >= 1073741824) return (n / 1073741824).toFixed(2) + ' GB';
        if (n >= 1048576) return (n / 1048576).toFixed(1) + ' MB';
        return (n / 1024).toFixed(1) + ' KB';
    }

    // Scan Directory via Server API

    function showToast(message, actionText = null, actionCallback = null, duration = 3200, level = 'info') {
        let container = document.getElementById('cachyToastContainer');
        if (!container) {
            container = document.createElement('div');
            container.id = 'cachyToastContainer';
            container.className = 'toastContainer';
            document.body.appendChild(container);
        }

        // Prevent overflowing toast stacks when rapidly skipping tracks on mobile
        while (container.children.length >= 2) {
            container.firstElementChild.remove();
        }

        const toast = document.createElement('div');
        const safeLevel = (level === 'success' || level === 'warning' || level === 'error') ? ` ${level}` : '';
        toast.className = `cachyToast${safeLevel}`;

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

    function showCachyToast(title, message = '', level = 'info') {
        const text = message ? `${title}: ${message}` : String(title || '');
        showToast(text, null, null, 2800, level);
    }

    function setScanStatus(msg, isError = false) {
        if (typeof document === 'undefined') return;
        const scanStatusEl = document.getElementById('scanStatus');
        if (scanStatusEl) {
            scanStatusEl.textContent = msg;
            scanStatusEl.style.color = isError ? 'var(--status-danger)' : 'var(--text-secondary)';
        }
        const settingsTabScanStatus = document.getElementById('settingsTabScanStatus');
        if (settingsTabScanStatus) {
            settingsTabScanStatus.textContent = msg;
            settingsTabScanStatus.style.color = isError ? 'var(--status-danger)' : 'var(--text-accent)';
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

