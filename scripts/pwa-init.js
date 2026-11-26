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
            // First installation can leave already-rendered managed covers on
            // their nonblocking placeholder. Refresh only this endpoint when
            // the worker gains control; do not reload the app or audio.
            navigator.serviceWorker.addEventListener('controllerchange', function () {
                if (!navigator.serviceWorker.controller) return;
                var endpoint = new URL('./php/api/cover.php', window.location.href);
                document.querySelectorAll('img[src]').forEach(function (img) {
                    try {
                        var url = new URL(img.getAttribute('src'), window.location.href);
                        if (url.origin !== endpoint.origin || url.pathname !== endpoint.pathname) return;
                        if (url.searchParams.has('cm_refresh')) return;
                        url.searchParams.set('cm_refresh', '1');
                        img.src = url.href;
                    } catch (_) {}
                });
            });
            window.addEventListener('load', function () {
                navigator.serviceWorker.register('./sw.js?v=3.0.0-dev.7.0').catch(function (err) {
                    console.warn('[PWA] ServiceWorker registration failed:', err);
                });
            });
        })();
