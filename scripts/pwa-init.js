(function () {
            var isNativeAndroid = window.AndroidBridge
                && typeof window.AndroidBridge.isAndroid === 'function'
                && window.AndroidBridge.isAndroid();
            if (!('serviceWorker' in navigator)) return;
            if (isNativeAndroid) {
                navigator.serviceWorker.getRegistrations().then(function (registrations) {
                    if (!registrations.length) return;
                    return Promise.all(registrations.map(function (reg) {
                        return reg.active && new URL(reg.active.scriptURL).pathname.endsWith('/sw.js') ? reg.unregister() : Promise.resolve(false);
                    })).then(function () {
                        window.location.reload();
                    });
                }).catch(function () {});
                return;
            }
            window.addEventListener('load', function () {
                navigator.serviceWorker.register('./sw.js?v=3.0.0-dev.6.18-integrity-ux').catch(function (err) {
                    console.warn('[PWA] ServiceWorker registration failed:', err);
                });
            });
        })();
