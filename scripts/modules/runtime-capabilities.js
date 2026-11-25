// CachyMusic - Cross-Platform Standalone Runtime Capability Detector & UI Adapter
import { safeStorage } from './utils.js';

let cachedRuntime = null;

function detectOsFamily() {
    if (typeof navigator === 'undefined') return 'linux';
    const ua = navigator.userAgent || '';
    const platform = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '';
    if (/Android/i.test(ua)) return 'android';
    if (/iPad|iPhone|iPod/i.test(ua) || (platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'ios';
    if (/Win/i.test(platform) || /Windows/i.test(ua)) return 'windows';
    if (/Mac|Darwin/i.test(platform) || /Macintosh|Mac OS X/i.test(ua)) return 'darwin';
    return 'linux';
}

export async function detectRuntimeCapabilities(forceRefresh = false) {
    if (cachedRuntime && !forceRefresh) return cachedRuntime;

    const osFamily = detectOsFamily();
    const isAndroidNative = typeof window !== 'undefined'
        && Boolean(window.AndroidBridge && typeof window.AndroidBridge.isAndroid === 'function' && window.AndroidBridge.isAndroid());
    const isStandalonePwa = typeof window !== 'undefined'
        && ((window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)
            || (typeof navigator !== 'undefined' && navigator.standalone === true));

    if (typeof document !== 'undefined' && document.documentElement) {
        if (!document.documentElement.dataset.os) document.documentElement.dataset.os = osFamily;
    }

    let hasPhpBackend = false;
    let phpOsFamily = null;
    let lanUrl = null;
    let mprisBridge = false, hardwareGain = false;

    if (!isAndroidNative && typeof fetch === 'function' && typeof window !== 'undefined' && ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname)) {
        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timer = controller ? setTimeout(() => controller.abort(), 900) : null;
        try {
            const res = await fetch('php/api/lan_info.php', {
                method: 'GET',
                cache: 'no-store',
                signal: controller ? controller.signal : undefined
            });
            const ctype = (res.headers.get('content-type') || '').toLowerCase();
            if (res.ok && ctype.includes('application/json')) {
                const raw = await res.text();
                if (!raw.trim().startsWith('<?php') && !raw.trim().startsWith('<')) {
                    const data = JSON.parse(raw);
                    if (data && typeof data === 'object' && ('success' in data || 'lanUrl' in data)) {
                        hasPhpBackend = true;
                        phpOsFamily = data.osFamily || null;
                        lanUrl = data.lanUrl || null;
                        mprisBridge = data.mprisBridge === true;
                        hardwareGain = data.hardwareGain === true;
                    }
                }
            }
        } catch (_) {
            hasPhpBackend = false;
        } finally {
            if (timer) clearTimeout(timer);
        }
    }

    const mode = isAndroidNative ? 'android-apk' : (hasPhpBackend ? 'php-desktop' : 'standalone-pwa');
    const resolvedOs = phpOsFamily || osFamily;

    cachedRuntime = {
        mode,
        osFamily: resolvedOs,
        isAndroidNative,
        isIOS: resolvedOs === 'ios',
        isWindows: resolvedOs === 'windows',
        isMacOS: resolvedOs === 'darwin',
        isLinux: resolvedOs === 'linux',
        isStandalonePwa,
        hasPhpBackend,
        lanUrl,
        hasDirectoryPicker: typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function',
        hasOpfs: typeof navigator !== 'undefined' && Boolean(navigator.storage && typeof navigator.storage.getDirectory === 'function'),
        hasIndexedDB: typeof window !== 'undefined' && Boolean(window.indexedDB),
        hasWebAudio: typeof window !== 'undefined' && Boolean(window.AudioContext || window.webkitAudioContext),
        hasAudioWorklet: typeof window !== 'undefined' && Boolean(window.AudioWorkletNode),
        hasMediaSession: typeof navigator !== 'undefined' && 'mediaSession' in navigator,
        hasNotifications: typeof window !== 'undefined' && 'Notification' in window,
        hasMprisBridge: hasPhpBackend && resolvedOs === 'linux' && mprisBridge,
        hasHardwareGain: isAndroidNative || (hasPhpBackend && resolvedOs === 'linux' && hardwareGain),
        getSoulseekHost: () => {
            if (isAndroidNative || !hasPhpBackend) return '';
            const h = safeStorage.getItem('cachymusic_slsk_host') || '';
            return h.trim().replace(/\/+$/, '') === window.location.origin ? window.location.origin : ''; 
        }
    };

    if (typeof document !== 'undefined' && document.documentElement) {
        document.documentElement.dataset.runtime = cachedRuntime.mode;
        document.documentElement.dataset.os = cachedRuntime.osFamily;
        if (cachedRuntime.isStandalonePwa) {
            document.documentElement.classList.add('is-standalone-pwa');
        }
    }

    return cachedRuntime;
}

export function getRuntime() {
    if (cachedRuntime) return cachedRuntime;
    const osFamily = detectOsFamily();
    const isAndroidNative = typeof window !== 'undefined'
        && Boolean(window.AndroidBridge && typeof window.AndroidBridge.isAndroid === 'function' && window.AndroidBridge.isAndroid());
    return {
        mode: isAndroidNative ? 'android-apk' : 'standalone-pwa',
        osFamily,
        isAndroidNative,
        isIOS: osFamily === 'ios',
        isWindows: osFamily === 'windows',
        isMacOS: osFamily === 'darwin',
        isLinux: osFamily === 'linux',
        isStandalonePwa: false,
        hasPhpBackend: false,
        lanUrl: null,
        hasDirectoryPicker: typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function',
        hasOpfs: typeof navigator !== 'undefined' && Boolean(navigator.storage && typeof navigator.storage.getDirectory === 'function'),
        hasIndexedDB: typeof window !== 'undefined' && Boolean(window.indexedDB),
        hasWebAudio: typeof window !== 'undefined' && Boolean(window.AudioContext || window.webkitAudioContext),
        hasAudioWorklet: typeof window !== 'undefined' && Boolean(window.AudioWorkletNode),
        hasMediaSession: typeof navigator !== 'undefined' && 'mediaSession' in navigator,
        hasNotifications: typeof window !== 'undefined' && 'Notification' in window,
        hasMprisBridge: false,
        hasHardwareGain: isAndroidNative,
        getSoulseekHost: () => ''
    };
}

export function applyRuntimeUiAdaptation(runtime = getRuntime()) {
    if (typeof document === 'undefined') return;

    // Expose system volume only when the runtime reports a supported backend.
    const hwGainRow = document.getElementById('settingsRowHwGain')
        || document.getElementById('settingsHwGainToggleBtn')?.closest('.settingsRowItem, .settingsControlRow, .settingsCard, .settingRow')
        || document.getElementById('settingsHardwareGainCard');
    if (hwGainRow) {
        const showHwGain = Boolean(runtime.hasHardwareGain);
        hwGainRow.style.display = showHwGain ? '' : 'none';
    }

    if(runtime.isAndroidNative){
        const share=document.getElementById('slskModalSharedDir');
        if(share){share.disabled=true;share.placeholder='Android uploads are not implemented';const label=document.querySelector('label[for="slskModalSharedDir"]');if(label)label.textContent='Sharing (not available on Android yet)';}
        const sync=document.getElementById('slskModalSyncSharePlayerDirBtn');if(sync)sync.disabled=true;
        const btn=document.getElementById('slskChangeSharedDirBtn');if(btn)btn.disabled=true;
        const text=document.getElementById('slskSharedPathText');if(text)text.textContent='Uploads unavailable';
    }
    // 2. Android Device Music button: adapt cleanly on non-Android platforms so there are zero dead buttons
    const scanDeviceBtn = document.getElementById('settingsScanDeviceMusicBtn');
    if (scanDeviceBtn) {
        if (runtime.isAndroidNative) {
            scanDeviceBtn.style.display = '';
        } else {
            scanDeviceBtn.textContent = runtime.isIOS ? 'IMPORT AUDIO FILES' : 'IMPORT FILES...';
            scanDeviceBtn.title = 'Import audio files directly into offline PWA library';
        }
    }

    // 3. Server path input & Scan action when running purely in standalone PWA / APK without PHP backend
    const folderPathInput = document.getElementById('folderPathInput');
    const scanFolderBtn = document.getElementById('scanFolderBtn');
    const browseFolderBtn = document.getElementById('browseFolderBtn');
    const folderTrayLabel = document.querySelector('.folderTrayLabel');
    const folderTrayHelp = document.querySelector('.folderTrayHelp');

    if (!runtime.hasPhpBackend) {
        if (folderPathInput) {
            folderPathInput.readOnly = true;
            folderPathInput.placeholder = runtime.isIOS
                ? 'Tap Browse / Import to add local audio files'
                : 'Select a music folder or audio files from device';
        }
        if (folderTrayLabel) folderTrayLabel.textContent = 'LOCAL LIBRARY SOURCE';
        if (folderTrayHelp) {
            folderTrayHelp.textContent = runtime.isIOS
                ? 'Choose audio files from Files / iCloud Drive to store offline in CachyMusic'
                : 'Choose a local music folder or audio files to index offline in your browser library';
        }
        if (browseFolderBtn) {
            browseFolderBtn.textContent = runtime.isIOS ? 'IMPORT FILES...' : 'CHOOSE FOLDER...';
        }
        if (scanFolderBtn) {
            scanFolderBtn.querySelector('span').textContent = 'RESCAN';
        }
    }

    // 4. Empty state messaging
    const emptySub = document.getElementById('playerEmptySub');
    const chooseBtn = document.getElementById('playerChooseDirBtn');
    if (chooseBtn) {
        chooseBtn.textContent = runtime.isIOS ? 'IMPORT AUDIO FILES' : 'CHOOSE MUSIC FOLDER';
    }
    if (emptySub && !runtime.hasPhpBackend) {
        emptySub.textContent = 'Choose a folder or import audio files from your device.';
    }
}
