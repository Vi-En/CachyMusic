import {fetchSoulseekJson} from './soulseek-transport.js';
import {safeStorage} from './utils.js';
import {getRuntime} from './runtime-capabilities.js';
import {AndroidSoulseekBridge} from './android-soulseek-bridge.js';

// Platform transport selection and bridge lifecycle.
    export function canReachSoulseekBackend() {
        const rt = getRuntime();
        return Boolean(rt.isAndroidNative || rt.hasPhpBackend || rt.getSoulseekHost());
    }

    function getSlskApiUrl(action, queryParams = '') {
        let base = 'php/api/soulseek.php';
        try {
            const rt = getRuntime();
            if (!rt.isAndroidNative) {
                const host = rt.getSoulseekHost();
                if (host) {
                    base = `${host}/php/api/soulseek.php`;
                }
            }
        } catch (_) {}
        const paramStr = queryParams ? `&${queryParams}` : '';
        return `${base}?action=${encodeURIComponent(action)}${paramStr}`;
    }

    /**
     * Scoped Soulseek API transport replacing legacy window.fetch monkey-patching.
     * Supports Android Native Bridge, paired Desktop LAN hosts, PHP Desktop backend,
     * and offline standalone PWA synthetic responses with zero failing network requests.
     */
    let androidRpc=null;
    function getAndroidRpc(){
        if(!androidRpc&&typeof window.AndroidBridge?.enqueueSoulseekApi==='function'){
            androidRpc=new AndroidSoulseekBridge(window.AndroidBridge);
            window.__cachySoulseekResult=(id,result)=>androidRpc.accept(id,result);
            window.addEventListener('pagehide',()=>androidRpc?.close());
        }
        return androidRpc;
    }
    export async function slskFetch(action, init = {}, queryParams = '') {
        const rt = getRuntime();
        const url = getSlskApiUrl(action, queryParams);

        if (rt.isAndroidNative && typeof window !== 'undefined' && window.AndroidBridge && (typeof window.AndroidBridge.enqueueSoulseekApi === 'function' || typeof window.AndroidBridge.callSoulseekApi === 'function')) {
            try {
                safeStorage.removeItem('cachymusic_slsk_host');
                localStorage.removeItem('cachymusic_slsk_host');
            } catch (_) {}
            try {
                const urlObj = new URL(url, window.location.href);
                const bodyStr = init && init.body
                    ? (typeof init.body === 'string' ? init.body : JSON.stringify(init.body))
                    : '{}';
                const rpc=getAndroidRpc();
                const respJson = rpc ? await rpc.request(action,bodyStr,urlObj.search) : window.AndroidBridge.callSoulseekApi(action, bodyStr, urlObj.search);
                return new Response(respJson, {
                    status: 200,
                    statusText: 'OK',
                    headers: { 'Content-Type': 'application/json' }
                });
            } catch (bridgeErr) {
                return new Response(JSON.stringify({ok:false,success:false,error:bridgeErr.message||'Native Soulseek request failed'}),{status:200,headers:{'Content-Type':'application/json'}});
            }
        }

        if (!canReachSoulseekBackend()) {
            return new Response(JSON.stringify({
                ok: false,
                success: false,
                standalone: true,
                connected: false,
                powered_on: false,
                connecting: false,
                has_credentials: false,
                daemon_running: false,
                reason: 'mobile_standalone',
                error: 'Soulseek requires the native app or a locally hosted desktop backend.'
            }), {
                status: 200,
                statusText: 'OK',
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const data = await fetchSoulseekJson(url, init);
        return {json: async () => data};
    }

