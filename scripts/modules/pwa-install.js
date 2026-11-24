// Lightweight PWA shell: keep install prompt handling off the P2P network module.
import { store } from './state.js';
import { showCachyToast } from './utils.js';
import { installAppBtn, switchWorkspace } from './ui-elements.js';

    // Trigger PWA Installation or Browser Instructions
    async function triggerPwaInstallPrompt() {
        if (store.state.deferredInstallPrompt) {
            store.state.deferredInstallPrompt.prompt();
            try {
                const choiceResult = await store.state.deferredInstallPrompt.userChoice;
                if (choiceResult && choiceResult.outcome === 'accepted') {
                    const btn = installAppBtn || document.getElementById('installAppBtn');
                    if (btn) btn.style.display = 'none';
                    const statusPill = document.getElementById('downloadPwaStatusPill');
                    if (statusPill) {
                        statusPill.textContent = 'Installed (PWA)';
                        statusPill.classList.add('active');
                    }
                }
            } catch (_) {}
            store.state.deferredInstallPrompt = null;
        } else {
            const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
                                 window.navigator.standalone === true;
            if (isStandalone) {
                showCachyToast('CachyMusic is already installed and running as a standalone app.');
                return;
            }

            const ua = (navigator.userAgent || '').toLowerCase();
            let advice = 'Install CachyMusic on your device:\n\n';
            if (/iphone|ipad|ipod/i.test(ua)) {
                advice += '• iOS Safari: Tap Share (square with upward arrow) -> "Add to Home Screen".';
            } else if (/android/i.test(ua)) {
                advice += '• Android Chrome: Tap Menu -> "Install app" or "Add to Home screen".';
            } else if (/mac/i.test(ua)) {
                advice += '• macOS Safari: Click File -> "Add to Dock".\n• Chrome / Brave: Click the Install icon in the address bar.';
            } else if (/win/i.test(ua)) {
                advice += '• Windows: Click the Install icon in Edge/Chrome address bar, or run bin/cachymusic.bat.';
            } else {
                advice += '• Linux Desktop: Click the Install icon in Chromium/Brave, or use the packaged .deb / AppImage / PKGBUILD.';
            }
            alert(advice);
        }
    }

    // PWA & Desktop Installation Handler
    let pwaInstallInitialized = false;
    function setupPwaInstallPrompt() {
        if (pwaInstallInitialized) return;
        const installBtn = installAppBtn || document.getElementById('installAppBtn');
        if (!installBtn) return;
        pwaInstallInitialized = true;

        // Window Controls Overlay (WCO) for desktop PWA titlebar integration
        if ('windowControlsOverlay' in navigator) {
            const handleWcoChange = () => {
                const isOverlay = navigator.windowControlsOverlay.visible;
                document.body.classList.toggle('wco-active', isOverlay);
                if (isOverlay && typeof navigator.windowControlsOverlay.getTitlebarAreaRect === 'function') {
                    const rect = navigator.windowControlsOverlay.getTitlebarAreaRect();
                    if (rect && rect.height) {
                        document.documentElement.style.setProperty('--wco-titlebar-height', `${rect.height}px`);
                    }
                }
            };
            navigator.windowControlsOverlay.addEventListener('geometrychange', handleWcoChange);
            handleWcoChange();
        }

        // Check if already running in standalone display mode
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
                             window.matchMedia('(display-mode: window-controls-overlay)').matches ||
                             window.navigator.standalone === true;
        if (isStandalone) {
            installBtn.style.display = 'none';
            const statusPill = document.getElementById('downloadPwaStatusPill');
            if (statusPill) {
                statusPill.textContent = 'Installed (Standalone)';
                statusPill.classList.add('active');
            }
            const pwaInstallHint = document.getElementById('pwaInstallHint');
            if (pwaInstallHint) {
                pwaInstallHint.textContent = '✓ CachyMusic is currently running as an installed standalone application.';
            }
            return;
        }

        // Listen for beforeinstallprompt (Chromium, Brave, Chrome, Edge, Android)
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            store.state.deferredInstallPrompt = e;
            installBtn.style.display = 'inline-flex';
            const statusPill = document.getElementById('downloadPwaStatusPill');
            if (statusPill) {
                statusPill.textContent = 'Install Ready';
                statusPill.classList.add('active');
            }
        });

        // Also display install button after initial load if not standalone,
        // so desktop & mobile users on all browsers have a clear way to install
        setTimeout(() => {
            if (!isStandalone) {
                installBtn.style.display = 'inline-flex';
            }
        }, 800);

        installBtn.addEventListener('click', async () => {
            if (store.state.deferredInstallPrompt) {
                try {
                    store.state.deferredInstallPrompt.prompt();
                    const choiceResult = await store.state.deferredInstallPrompt.userChoice;
                    if (choiceResult && choiceResult.outcome === 'accepted') {
                        store.state.deferredInstallPrompt = null;
                        installBtn.style.display = 'none';
                    }
                } catch (err) {
                    console.warn('[PWA] Install prompt failed:', err);
                }
            } else {
                switchWorkspace(store.state.currentWorkspace === 'download' ? 'player' : 'download');
            }
        });

        window.addEventListener('appinstalled', () => {
            installBtn.style.display = 'none';
            store.state.deferredInstallPrompt = null;
            const statusPill = document.getElementById('downloadPwaStatusPill');
            if (statusPill) {
                statusPill.textContent = 'Installed (PWA)';
                statusPill.classList.add('active');
            }
        });
    }


export { triggerPwaInstallPrompt, setupPwaInstallPrompt };
