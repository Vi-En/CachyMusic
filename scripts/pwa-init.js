(function () {
            var isNativeAndroid = window.AndroidBridge
                && typeof window.AndroidBridge.isAndroid === 'function'
                && window.AndroidBridge.isAndroid();
            if (!('serviceWorker' in navigator)) return;
            if (isNativeAndroid) {
                navigator.serviceWorker.getRegistrations().then(function (registrations) {
                    if (!registrations.length) return;
                    return Promise.all(registrations.map(function (reg) {
                        var worker = reg.active || reg.waiting || reg.installing;
                        var expected = new URL('./sw.js', window.location.href);
                        var actual = worker && new URL(worker.scriptURL);
                        return actual && actual.origin === expected.origin && actual.pathname === expected.pathname
                            && reg.scope === new URL('./', expected).href ? reg.unregister() : Promise.resolve(false);
                    })).then(function (removed) {
                        if (removed.some(Boolean)) window.location.reload();
                    });
                }).catch(function () {});
                return;
            }
            window.addEventListener('load', function () {
                navigator.serviceWorker.register('./sw.js?v=3.0.0-dev.6.43-integrity-ux').catch(function (err) {
                    console.warn('[PWA] ServiceWorker registration failed:', err);
                });
            });
        })();
