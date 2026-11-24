import {findTrackIndex, mergeTracks, dismissalKey} from './track-session.js';
import {describePeerAudio, comparePeerBitrate, peerBitrate} from './soulseek-result-metadata.js';
import { uiIcon } from './icons.js';
import { triggerPwaInstallPrompt, setupPwaInstallPrompt } from './pwa-install.js';
import { SOULSEEK_RESULT_BATCH, resultPageWindow, clampTransferProgress, transferActionSignature } from './soulseek-ui-budget.js';
// CachyMusic - P2P Network, Downloads & PWA Integration
import {
    escapeHtml,
    escapeRegex,
    formatFileSize,
    isMobileDevice,
    popModalState,
    pushModalState,
    safeStorage,
    showCachyToast
} from './utils.js';
import { store } from './state.js';
import { AndroidSoulseekBridge } from './android-soulseek-bridge.js';
import { getRuntime } from './runtime-capabilities.js';
import { applySearchAndSort } from './library.js';
import { loadTrack, playbackIntentVersion } from './player-core.js';
import {
    bindFastAction,
    folderPathInput,
    setMobileSearchPanelCollapsed,
    slskAccountAlert,
    slskAccountBtn,
    slskAccountModal,
    slskActiveSearchMeta,
    slskChangeDirBtn,
    slskChangeSharedDirBtn,
    slskClearSubFilterBtn,
    slskCloseAccountModalBtn,
    slskCloseDrawerBtn,
    slskDownloadsPathText,
    slskExcludeFilterClearBtn,
    slskExcludeFilterInput,
    slskFilterChips,
    slskIncludeFilterClearBtn,
    slskIncludeFilterInput,
    slskLogoutBtn,
    slskMobileActiveFilter,
    slskMobileTransferCount,
    slskMobileTransfersBtn,
    slskModalDownloadDir,
    slskModalPassword,
    slskModalPowerBtn,
    slskModalSharedDir,
    slskModalSyncPlayerDirBtn,
    slskModalSyncSharePlayerDirBtn,
    slskModalUsername,
    slskPanelToggleBar,
    slskPlaceholder,
    slskPowerBtn,
    slskPowerBtnText,
    slskRefreshStatusBtn,
    slskResultCount,
    slskResultsList,
    slskSaveAccountBtn,
    slskScanDownloadsBtn,
    slskSearchClearBtn,
    slskSearchInput,
    slskSearchSubmitBtn,
    slskSearchingState,
    slskSearchingTitle,
    slskSharedPathText,
    slskStartDaemonBtn,
    slskStatusDot,
    slskStatusText,
    slskSuggestedChips,
    slskSuggestedRow,
    slskSyncCurrentDirBtn,
    slskToggleTransfersBtn,
    slskTransferCount,
    slskTransfersDrawer,
    slskTransfersList,
    slskTransfersSummary,
    slskUsername,
    soulseekWorkspace,
    switchWorkspace,
    toggleMobileSearchPanel,
    wsSoulseekBadge
} from './ui-elements.js';

    // Cross-Platform Download Hub & LAN Setup
    let lanUrlFetched = false;
    async function fetchLanStreamingUrl() {
        const rt = getRuntime();
        if (lanUrlFetched || !rt.hasPhpBackend) {
            if (!rt.hasPhpBackend && typeof window !== 'undefined' && window.location.protocol.startsWith('http')) {
                const lanInput = document.getElementById('downloadLanUrlInput');
                const copyBtn = document.getElementById('copyLanUrlBtn');
                if (lanInput && !lanInput.value) lanInput.value = window.location.origin;
                if (copyBtn && !copyBtn.dataset.copy) copyBtn.dataset.copy = window.location.origin;
                lanUrlFetched = true;
            }
            return;
        }
        try {
            const res = await fetch('php/api/lan_info.php');
            const data = await res.json();
            if (data && data.success && data.lanUrl) {
                lanUrlFetched = true;
                const lanInput = document.getElementById('downloadLanUrlInput');
                const copyBtn = document.getElementById('copyLanUrlBtn');
                if (lanInput) lanInput.value = data.lanUrl;
                if (copyBtn) copyBtn.dataset.copy = data.lanUrl;
            }
        } catch (e) {
            console.warn('[LAN] Failed to fetch LAN streaming info:', e);
        }
    }

    function setupDownloadWorkspace() {
        const downloadTabs = document.querySelectorAll('.downloadTabBtn');
        const downloadPanels = document.querySelectorAll('.downloadPanel');
        const returnBtn = document.getElementById('downloadReturnBtn');

        function activatePlatformTab(platform) {
            downloadTabs.forEach(tab => {
                const isActive = tab.dataset.platform === platform;
                tab.classList.toggle('active', isActive);
                tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
            });

            downloadPanels.forEach(panel => {
                const isMatch = panel.id === `platform-${platform}`;
                panel.classList.toggle('active', isMatch);
                panel.style.display = isMatch ? 'block' : 'none';
            });
        }

        downloadTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const platform = tab.dataset.platform;
                if (platform) activatePlatformTab(platform);
            });
        });

        if (returnBtn) {
            returnBtn.addEventListener('click', () => {
                switchWorkspace('player');
            });
        }

        // Copy-to-clipboard buttons with animated feedback
        document.querySelectorAll('.copyCodeBtn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const textToCopy = btn.dataset.copy || (btn.previousElementSibling && btn.previousElementSibling.value);
                if (!textToCopy) return;

                let copySuccess = false;
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    try {
                        await navigator.clipboard.writeText(textToCopy);
                        copySuccess = true;
                    } catch (_) {}
                }

                if (!copySuccess) {
                    try {
                        const textarea = document.createElement('textarea');
                        textarea.value = textToCopy;
                        textarea.style.position = 'fixed';
                        textarea.style.opacity = '0';
                        document.body.appendChild(textarea);
                        textarea.select();
                        document.execCommand('copy');
                        document.body.removeChild(textarea);
                        copySuccess = true;
                    } catch (_) {}
                }

                if (copySuccess) {
                    const originalHtml = btn.innerHTML;
                    btn.innerHTML = '✓ COPIED!';
                    btn.classList.add('copied');
                    setTimeout(() => {
                        btn.innerHTML = originalHtml;
                        btn.classList.remove('copied');
                    }, 1800);
                }
            });
        });

        // Wire 1-Click PWA Buttons in Download Hub
        const pwaActionBtns = document.querySelectorAll('.downloadDirectPwaBtn, #downloadPwaTriggerBtn');
        pwaActionBtns.forEach(btn => {
            btn.addEventListener('click', triggerPwaInstallPrompt);
        });

        // Auto-detect current operating system to highlight YOUR OS badge (or read ?platform=)
        const urlParams = new URLSearchParams(window.location.search);
        let defaultPlatform = urlParams.get('platform') || '';
        let detected = 'linux';
        const ua = (navigator.userAgent || '').toLowerCase();
        if (/iphone|ipad|ipod|android/i.test(ua)) {
            detected = 'mobile';
        } else if (/win/i.test(ua)) {
            detected = 'windows';
        } else if (/mac/i.test(ua)) {
            detected = 'macos';
        } else {
            detected = 'linux';
        }

        // Show "YOUR OS" badge on the detected platform tab
        const detectedBadge = document.getElementById(`osBadge-${detected}`);
        if (detectedBadge) {
            detectedBadge.style.display = 'inline-block';
        }

        if (!defaultPlatform) {
            defaultPlatform = detected;
        }
        activatePlatformTab(defaultPlatform);
    }



    function canReachSoulseekBackend() {
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
            window.addEventListener('pagehide',()=>androidRpc?.close(),{once:true});
        }
        return androidRpc;
    }
    async function slskFetch(action, init = {}, queryParams = '') {
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

        return fetch(url, init);
    }

    // =========================================================================
    // Soulseek Controller - Nicotine+ REST Engine
    // =========================================================================
    const soulseekController = {
        activeToken: null,
        activeQuery: '',
        rawResults: [],
        activeFilter: 'all',
        activeSubFilter: null,
        includeFilterQuery: '',
        excludeFilterQuery: '',
        inResultFilterQuery: '',
        suggestedTags: [],
        activeSort: 'speed-desc',
        searchPollTimer: null,
        searchGeneration: 0,
        statusPolling: false,
        transferRequest: null,
        transfersPollTimer: null,
        statusPollTimer: null,
        isSearching: false,
        autoPlayQueue: new Map(),
        resultPage: 0,
        playIntentSerial: 0,

        downloadsDir: '',
        sharedDir: '',
        isPowered: false,
        isConnected: false,
        isConnecting: false,
        hasCredentials: false,
        lastStatus: null,

        startStatusPolling() {
            if (this.statusPolling || !canReachSoulseekBackend()) return;
            this.statusPolling = true;
            const schedulePoll = () => {
                if (!this.statusPolling || this.statusPollTimer) return;
                if (!canReachSoulseekBackend()) {
                    this.statusPolling = false;
                    return;
                }
                let delay = 25000;
                if (store.state.currentWorkspace === 'soulseek' || this.isConnecting || this.isSearching) {
                    delay = 5000;
                } else if (this.isConnected) {
                    delay = 15000;
                }
                this.statusPollTimer = setTimeout(async () => {
                    this.statusPollTimer = null;
                    if (!document.hidden) {
                        try {
                            await this.checkStatus();
                        } catch (_) {}
                    }
                    schedulePoll();
                }, delay);
            };
            schedulePoll();
        },

        stopStatusPolling() {
            this.statusPolling = false;
            if (this.statusPollTimer) {
                clearTimeout(this.statusPollTimer);
                this.statusPollTimer = null;
            }
        },

        updatePowerUI(status) {
            const isConn = Boolean(status.connected);
            const isConnBusy = Boolean(status.connecting);
            const isPow = Boolean(status.powered_on || isConn);
            const hasCreds = Boolean(status.has_credentials);

            this.isConnected = isConn;
            this.isConnecting = isConnBusy;
            this.isPowered = isPow;
            this.hasCredentials = hasCreds;

            if (slskPowerBtn) {
                slskPowerBtn.classList.remove('power-on', 'power-off', 'busy');
                if (isConnBusy) {
                    slskPowerBtn.classList.add('busy');
                    if (slskPowerBtnText) slskPowerBtnText.textContent = 'CONNECTING...';
                    slskPowerBtn.disabled = true;
                    slskPowerBtn.title = 'Connecting to Soulseek network...';
                } else if (isConn) {
                    slskPowerBtn.classList.add('power-on');
                    if (slskPowerBtnText) slskPowerBtnText.textContent = 'DISCONNECT';
                    slskPowerBtn.disabled = false;
                    slskPowerBtn.title = 'Online. Click to Disconnect (disconnects and stops sharing files)';
                } else {
                    slskPowerBtn.classList.add('power-off');
                    if (slskPowerBtnText) slskPowerBtnText.textContent = 'CONNECT';
                    slskPowerBtn.disabled = false;
                    slskPowerBtn.title = hasCreds
                        ? 'Soulseek is Disconnected. Click to Connect'
                        : 'Click to configure Soulseek account and Connect';
                }
            }

            if (slskModalPowerBtn) {
                slskModalPowerBtn.classList.remove('power-on', 'busy');
                if (isConnBusy) {
                    slskModalPowerBtn.classList.add('busy');
                    slskModalPowerBtn.textContent = 'CONNECTING...';
                    slskModalPowerBtn.disabled = true;
                } else if (isConn) {
                    slskModalPowerBtn.classList.add('power-on');
                    slskModalPowerBtn.textContent = 'DISCONNECT';
                    slskModalPowerBtn.disabled = false;
                } else {
                    slskModalPowerBtn.textContent = 'CONNECT';
                    slskModalPowerBtn.disabled = !hasCreds && !(slskModalUsername && slskModalUsername.value.trim());
                }
            }
        },

        togglePower() {
            if (!this.powerRequest) this.powerRequest = this.performTogglePower().finally(() => { this.powerRequest = null; });
            return this.powerRequest;
        },

        async performTogglePower() {
            if (this.isConnecting) return;

            if (!this.isConnected && !this.hasCredentials) {
                if (slskAccountBtn) slskAccountBtn.click();
                if (slskAccountAlert) {
                    slskAccountAlert.className = 'slskModalAlert';
                    slskAccountAlert.textContent = 'Please configure your Soulseek username and password first.';
                    slskAccountAlert.style.display = 'block';
                }
                return;
            }

            const targetState = this.isConnected ? 'off' : 'on';
            if (targetState === 'on' && !confirm('Connect to Soulseek? Your IP address, account, searches and shared files may be visible to peers. Only share files you have permission to distribute.')) return;

            if (slskPowerBtn) {
                slskPowerBtn.disabled = true;
                slskPowerBtn.classList.add('busy');
            }
            if (slskPowerBtnText) {
                slskPowerBtnText.textContent = targetState === 'on' ? 'CONNECTING...' : 'DISCONNECTING...';
            }
            if (slskModalPowerBtn) {
                slskModalPowerBtn.disabled = true;
                slskModalPowerBtn.textContent = targetState === 'on' ? 'CONNECTING...' : 'DISCONNECTING...';
            }

            try {
                const res = await slskFetch('power', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ state: targetState })
                });
                const data = await res.json();

                if (!data.ok) {
                    if (slskAccountAlert) {
                        renderSlskDiagnosticAlert(slskAccountAlert, data, `Failed to ${targetState === 'on' ? 'connect' : 'disconnect'}`);
                    } else {
                        alert(data.error || data.message || `Failed to ${targetState === 'on' ? 'connect' : 'disconnect'}`);
                    }
                } else {
                    if (slskAccountAlert) {
                        slskAccountAlert.className = 'slskModalAlert success';
                        slskAccountAlert.textContent = data.message || `Soulseek ${targetState === 'on' ? 'Connected' : 'Disconnected'}`;
                        slskAccountAlert.style.display = 'block';
                    }
                }
            } catch (err) {
                console.warn('Power toggle error:', err);
            } finally {
                await this.checkStatus();
            }
        },

        async checkStatus() {
            try {
                const res = await slskFetch('status');
                const data = await res.json();
                this.lastStatus = data;

                if (data.downloads_dir) {
                    this.downloadsDir = data.downloads_dir;
                    if (slskDownloadsPathText) {
                        slskDownloadsPathText.textContent = data.downloads_dir;
                    }
                    if (slskChangeDirBtn) {
                        slskChangeDirBtn.setAttribute('title', `Downloads: ${data.downloads_dir} (Click to change)`);
                    }
                }

                if(data.uploads_supported===false){
                    if(slskSharedPathText)slskSharedPathText.textContent="Uploads unavailable";
                    if(slskChangeSharedDirBtn){slskChangeSharedDirBtn.disabled=true;slskChangeSharedDirBtn.title="Android upload serving is not implemented";}
                } else if (data.shared_dir) {
                    this.sharedDir = data.shared_dir;
                    if (slskSharedPathText) {
                        slskSharedPathText.textContent = data.shared_dir;
                    }
                    if (slskChangeSharedDirBtn) {
                        slskChangeSharedDirBtn.setAttribute('title', `Shared folder: ${data.shared_dir} (Click to change)`);
                    }
                }

                this.updatePowerUI(data);

                const rt = getRuntime();
                const isNative = data.daemon_type === 'embedded-native' || rt.isAndroidNative;
                const clientLabel = 'SOULSEEK';
                const slskBadge = document.getElementById('slskBadge');
                if (slskBadge) {
                    slskBadge.textContent = clientLabel;
                }

                if (data.standalone) {
                    if (slskStatusDot) slskStatusDot.className = 'slskStatusDot offline';
                    if (slskStatusText) slskStatusText.textContent = 'SOULSEEK REQUIRES APP PACKAGE';
                    if (wsSoulseekBadge) wsSoulseekBadge.className = 'wsBadge offline';
                    if (slskUsername) slskUsername.textContent = 'Install the packaged app';
                    if (slskStartDaemonBtn) slskStartDaemonBtn.style.display = 'none';
                } else if (data.ok) {
                    if (data.connected) {
                        if (slskStatusDot) slskStatusDot.className = 'slskStatusDot online';
                        if (slskStatusText) slskStatusText.textContent = `ONLINE: ${data.login_username}`;
                        if (wsSoulseekBadge) wsSoulseekBadge.className = 'wsBadge online';
                        if (slskUsername) slskUsername.textContent = data.login_username;
                    } else if (data.connecting) {
                        if (slskStatusDot) slskStatusDot.className = 'slskStatusDot busy';
                        if (slskStatusText) slskStatusText.textContent = 'CONNECTING TO SOULSEEK...';
                        if (wsSoulseekBadge) wsSoulseekBadge.className = 'wsBadge busy';
                        if (slskUsername) slskUsername.textContent = `${data.login_username} (Connecting)`;
                    } else if (data.has_credentials) {
                        if (slskStatusDot) slskStatusDot.className = 'slskStatusDot offline';
                        if (slskStatusText) slskStatusText.textContent = data.error ? `AUTH FAILED: ${data.error}` : `${clientLabel} OFFLINE (DISCONNECTED)`;
                        if (wsSoulseekBadge) wsSoulseekBadge.className = 'wsBadge offline';
                        if (slskUsername) slskUsername.textContent = `${data.login_username} (Offline)`;
                    } else {
                        if (slskStatusDot) slskStatusDot.className = 'slskStatusDot offline';
                        if (slskStatusText) slskStatusText.textContent = 'NOT CONFIGURED (CLICK SETTINGS)';
                        if (wsSoulseekBadge) wsSoulseekBadge.className = 'wsBadge offline';
                        if (slskUsername) slskUsername.textContent = 'Not configured';
                    }
                    if (slskStartDaemonBtn) slskStartDaemonBtn.style.display = 'none';
                } else if (data.daemon_running) {
                    if (slskStatusDot) slskStatusDot.className = 'slskStatusDot busy';
                    if (slskStatusText) slskStatusText.textContent = `${clientLabel} INITIALIZING...`;
                    if (wsSoulseekBadge) wsSoulseekBadge.className = 'wsBadge busy';
                    if (slskStartDaemonBtn) slskStartDaemonBtn.style.display = 'none';
                } else {
                    if (slskStatusDot) slskStatusDot.className = 'slskStatusDot offline';
                    if (slskStatusText) slskStatusText.textContent = `${clientLabel} OFFLINE`;
                    if (wsSoulseekBadge) wsSoulseekBadge.className = 'wsBadge offline';
                    if (slskStartDaemonBtn) {
                        slskStartDaemonBtn.style.display = 'inline-block';
                        slskStartDaemonBtn.disabled = false;
                        slskStartDaemonBtn.textContent = `Start ${clientLabel}`;
                    }
                }
            } catch (err) {
                console.warn('Soulseek status error:', err);
                if (slskStatusDot) slskStatusDot.className = 'slskStatusDot offline';
                if (slskStatusText) slskStatusText.textContent = 'REST API OFFLINE';
                if (wsSoulseekBadge) wsSoulseekBadge.className = 'wsBadge offline';
                if (slskStartDaemonBtn) {
                    slskStartDaemonBtn.style.display = getRuntime().hasPhpBackend ? 'inline-block' : 'none';
                    slskStartDaemonBtn.disabled = false;
                    slskStartDaemonBtn.textContent = 'Start NICOTINE+';
                }
            } finally {
                const mobileDot = document.querySelector('#slskMobileStatusDot .slskStatusDot');
                if (mobileDot && slskStatusDot) {
                    mobileDot.className = slskStatusDot.className;
                }

                // Update Soulseek Workspace Diagnostic Notice Banner
                const wsNotice = document.getElementById('slskWorkspaceNotice');
                if (wsNotice) {
                    const statusObj = this.lastStatus || {};
                    if (statusObj.ok && statusObj.connected) {
                        wsNotice.style.display = 'none';
                    } else {
                        const noticeTitle = document.getElementById('slskNoticeTitle');
                        const noticeMsg = document.getElementById('slskNoticeMsg');
                        const noticeIcon = document.getElementById('slskNoticeIcon');

                        let nTitle = 'Soulseek Disconnected';
                        let nMsg = 'Files are unexposed. Click Settings to configure or connect.';

                        if (statusObj.standalone) {
                            nTitle = 'Standalone PWA Mode';
                            nMsg = 'Soulseek P2P requires a paired CachyMusic Desktop Host (LAN IP) in Account Settings, or use local device music files.';
                        } else if (statusObj.reason === 'mobile_standalone') {
                            nTitle = 'Soulseek Standalone Mode';
                            nMsg = 'Soulseek is currently disconnected. Click Settings to enter credentials and connect directly to the Soulseek network.';
                        } else if (!statusObj.daemon_running || (statusObj.error && /12339|daemon|refused/i.test(statusObj.error))) {
                            nTitle = 'Soulseek Daemon Offline';
                            nMsg = 'Nicotine+ background service is offline on port 12339. Start the service on your host PC.';
                        } else if (statusObj.has_credentials) {
                            nTitle = 'Soulseek Offline';
                            nMsg = statusObj.error ? `Auth issue: ${statusObj.error}` : 'Soulseek is currently disconnected. Click Settings to connect.';
                        } else {
                            nTitle = 'Soulseek Not Configured';
                            nMsg = 'Click Settings to enter your Soulseek username and password.';
                        }

                        if (noticeTitle) noticeTitle.textContent = nTitle;
                        if (noticeMsg) noticeMsg.textContent = nMsg;
                        if (noticeIcon) noticeIcon.innerHTML = uiIcon('info');
                        wsNotice.style.display = 'flex';
                    }
                }
            }
        },

        async startDaemon() {
            if (this.daemonStartInProgress) return;
            if (!getRuntime().hasPhpBackend && !getRuntime().getSoulseekHost()) {
                showCachyToast('Pair a desktop host in Account Settings to control the remote daemon.');
                return;
            }
            this.daemonStartInProgress = true;
            if (slskStartDaemonBtn) {
                slskStartDaemonBtn.textContent = 'STARTING...';
                slskStartDaemonBtn.disabled = true;
            }
            if (slskStatusText) slskStatusText.textContent = 'LAUNCHING DAEMON...';
            if (slskStatusDot) slskStatusDot.className = 'slskStatusDot busy';
            const mobileDot = document.querySelector('#slskMobileStatusDot .slskStatusDot');
            if (mobileDot) mobileDot.className = 'slskStatusDot busy';
            if (wsSoulseekBadge) wsSoulseekBadge.className = 'wsBadge busy';

            try {
                const res = await slskFetch('start_daemon', { method: 'POST' });
                const data = await res.json();
                if (data.ok === false) throw new Error(data.error || data.message || 'Daemon start failed');
                // Await each status query before starting the next. The old
                // setInterval could overlap requests when the server was slow.
                for (let attempt = 0; attempt < 4; attempt++) {
                    await new Promise(resolve => setTimeout(resolve, 1200));
                    await this.checkStatus();
                    if (this.isConnected) break;
                }
            } catch (err) {
                console.warn('Could not start daemon:', err);
                await this.checkStatus();
            } finally {
                this.daemonStartInProgress = false;
                if (slskStartDaemonBtn) {
                    slskStartDaemonBtn.textContent = 'START DAEMON';
                    slskStartDaemonBtn.disabled = false;
                }
            }
        },

        renderSearchingAnimation(query, statusText = 'Waiting for peer responses…') {
            if (!slskResultsList) return;
            slskResultsList.innerHTML = `
                <div class="slskSearchingState" role="status" id="slskSearchingState">
                    <h3 id="slskSearchingTitle">Searching Soulseek…</h3>
                    <p>Looking for “${escapeHtml(query)}”</p>
                    <p id="slskSearchingPeerStatus">${escapeHtml(statusText)}</p>
                </div>`;
        },

        renderNoResultsFound(query, failed = false) {
            if (!slskResultsList) return;
            slskResultsList.innerHTML = `
                <div class="slskPlaceholder noResultsFound" role="status">
                    <h3>${failed ? 'Search unavailable' : 'No results returned'}</h3>
                    <p>${failed ? 'Could not retrieve peer responses. Check the connection and try again.' : `No results returned for “${escapeHtml(query)}” during this search. Try fewer terms or search again later.`}</p>
                </div>`;
            if (slskResultCount) slskResultCount.textContent = failed ? 'Search unavailable' : '0 results';
        },

        async search(query) {
            const q = (query || '').trim();
            if (!q) return;
            const generation = ++this.searchGeneration;
            clearTimeout(this.searchPollTimer);
            this.searchPollTimer = null;
            this.activeToken = null;

            if (!this.isConnected) {
                if (!this.hasCredentials) {
                    if (slskAccountBtn) slskAccountBtn.click();
                    return;
                }

                await this.togglePower();
                if (!this.isConnected || generation !== this.searchGeneration) return;
            }

            this.activeQuery = q;
            if (window.innerWidth <= 768) {
                setMobileSearchPanelCollapsed(true);
                const textFiltersCon = document.getElementById('slskTextFiltersCon');
                const textFilterBtn = document.getElementById('slskTextFilterToggleBtn');
                if (textFiltersCon && textFiltersCon.classList.contains('open')) {
                    textFiltersCon.classList.remove('open');
                    if (textFilterBtn && !this.includeFilterQuery && !this.excludeFilterQuery) {
                        textFilterBtn.classList.remove('active');
                    }
                }
            }
            this.rawResults = [];
            this.resultPage = 0;
            this.activeSubFilter = null;
            this.includeFilterQuery = (slskIncludeFilterInput?.value || '').trim();
            this.excludeFilterQuery = (slskExcludeFilterInput?.value || '').trim();
            this.inResultFilterQuery = this.includeFilterQuery;
            this.suggestedTags = [];
            this.renderSuggestedChips();
            this.isSearching = true;

            if (wsSoulseekBadge) wsSoulseekBadge.className = 'wsBadge busy';
            if (slskActiveSearchMeta) slskActiveSearchMeta.textContent = q;
            if (slskResultCount) slskResultCount.textContent = 'Searching…';

            // Clear results belonging to the previous search.
            this.renderSearchingAnimation(q, 'Starting search…');

            try {
                const searchModeSelect = document.getElementById('slskSearchModeSelect');
                const searchMode = searchModeSelect ? searchModeSelect.value : 'global';
                const isNativeMobile = !!(window.CachyNativeSoulseek && typeof window.CachyNativeSoulseek.call === 'function');

                const res = await slskFetch('search', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ query: q, mode: searchMode })
                }, `query=${encodeURIComponent(q)}&mode=${encodeURIComponent(searchMode)}`);
                const data = await res.json();
                if (generation !== this.searchGeneration) return;

                if (!data.ok) {
                    const peerStatusEl = document.getElementById('slskSearchingPeerStatus');
                    if (peerStatusEl) peerStatusEl.textContent = `Search error: ${data.message || data.error || (isNativeMobile ? 'Check Soulseek login' : 'Check Nicotine+')}`;
                    this.isSearching = false;
                    return;
                }

                this.activeToken = data.token;

                let pollCount = 0;
                let receivedResultsResponse = false;
                const maxPolls = 16;

                const doPoll = async () => {
                    if (generation !== this.searchGeneration) return;
                    this.searchPollTimer = null;
                    pollCount++;
                    const peerStatusEl = document.getElementById('slskSearchingPeerStatus');
                    if (peerStatusEl && this.isSearching && (!this.rawResults || this.rawResults.length === 0)) {
                        peerStatusEl.textContent = 'Waiting for peer responses…';
                    }
                    receivedResultsResponse = (await this.pollResults(data.token, generation)) || receivedResultsResponse;
                    if (generation !== this.searchGeneration) return;
                    if (pollCount >= maxPolls) {
                        this.isSearching = false;
                        if (wsSoulseekBadge) wsSoulseekBadge.className = 'wsBadge online';
                        if (!this.rawResults || this.rawResults.length === 0) {
                            this.renderNoResultsFound(q, !receivedResultsResponse);
                        } else {
                            this.applyFilterAndRender();
                        }
                    } else this.searchPollTimer = setTimeout(doPoll, 1000);
                };

                this.searchPollTimer = setTimeout(doPoll, 400);

            } catch (err) {
                if (generation !== this.searchGeneration) return;
                console.warn('Search request error:', err);
                const peerStatusEl = document.getElementById('slskSearchingPeerStatus');
                const isNativeMobile = !!(window.CachyNativeSoulseek && typeof window.CachyNativeSoulseek.call === 'function');
                if (peerStatusEl) peerStatusEl.textContent = isNativeMobile ? 'Connection error reaching Soulseek network' : 'Connection error reaching Nicotine+ daemon';
                this.isSearching = false;
            }
        },

        async pollResults(token, generation = this.searchGeneration) {
            if (!token) return;
            try {
                const res = await slskFetch('results', {}, `token=${encodeURIComponent(token)}&limit=250`);
                const data = await res.json();
                if (token !== this.activeToken || generation !== this.searchGeneration) return;

                if (data.ok && Array.isArray(data.items)) {
                    if (data.items.length > 0) {
                        this.rawResults = data.items;
                        this.extractSuggestions(data.items);
                        this.applyFilterAndRender();
                    }
                    return true;
                }
            } catch (err) {
                console.warn('Poll results error:', err);
            }
        },

        activeSortField: 'speed',
        activeSortDir: 'desc',

        setSortColumn(field) {
            if (this.activeSortField === field) {
                // Toggle direction
                this.activeSortDir = this.activeSortDir === 'asc' ? 'desc' : 'asc';
            } else {
                this.activeSortField = field;
                // Default directions: speed, size, bitrate, slots start desc; filename, format start asc
                this.activeSortDir = (field === 'filename' || field === 'format') ? 'asc' : 'desc';
            }
            this.updateSortHeaderUI();
            this.applyFilterAndRender();
        },

        updateSortHeaderUI() {
            const headerCols = document.querySelectorAll('.slskResultsHeader .col.sortable');
            headerCols.forEach(col => {
                const field = col.dataset.sort;
                const indicator = col.querySelector('.sortIndicator');
                if (field === this.activeSortField) {
                    col.classList.add('active');
                    col.classList.toggle('asc', this.activeSortDir === 'asc');
                    col.classList.toggle('desc', this.activeSortDir === 'desc');
                    if (indicator) {
                        indicator.innerHTML = uiIcon(this.activeSortDir === 'asc' ? 'up' : 'down');
                    }
                } else {
                    col.classList.remove('active', 'asc', 'desc');
                    if (indicator) {
                        indicator.innerHTML = uiIcon('both');
                    }
                }
            });
        },

        extractSuggestions(items) {
            if (!items || items.length === 0) {
                this.suggestedTags = [];
                this.renderSuggestedChips();
                return;
            }

            const currentQuery = (this.activeQuery || '').trim();
            const queryWords = new Set(currentQuery.toLowerCase().split(/\s+/).filter(Boolean));

            const ignoreWords = new Set([
                'music', 'flac', 'mp3', 'cd', 'disc', 'album', 'va', 'vbr', 'cbr', '320',
                '320kbps', 'lossless', 'remix', 'remixes', 'deluxe', 'edition', 'ost',
                'soundtrack', 'single', 'ep', 'various', 'artists', 'tracks', 'audio',
                'complete', 'discography', 'vol', 'volume', 'new music', 'unknown',
                'soundtracks', 'greatest hits', 'the best of', 'best of', 'hit collection',
                'hi-res', 'high resolution', 'remaster', 'remastered', 'bonus track', 'bonus tracks'
            ]);

            const albumCounts = new Map();
            const trackCounts = new Map();

            items.forEach(it => {
                // 1. Process Album / Subfolder
                let alb = (it.albumGuess || '').trim();
                if (alb) {
                    alb = alb.replace(/^\d+[\s._-]+/, '');
                    alb = alb.replace(/\s*\(?\b(19|20)\d{2}\b\)?.*$/, '');
                    alb = alb.replace(/\s*\[.*?\]/g, '');
                    alb = alb.replace(/\s*\(.*?(flac|mp3|320|lossless|deluxe|edition|cd|remaster|reissue|bonus).*?\)/gi, '');
                    if (currentQuery) {
                        const qRegex = new RegExp('^' + escapeRegex(currentQuery) + '[\\s\\-_:]*', 'i');
                        alb = alb.replace(qRegex, '').trim();
                    }
                    alb = alb.replace(/[\s._-]+$/, '').trim();
                    const lowAlb = alb.toLowerCase();
                    if (alb.length >= 3 && alb.length <= 40 && !ignoreWords.has(lowAlb)) {
                        const albWords = lowAlb.split(/\s+/).filter(Boolean);
                        if (!albWords.every(w => queryWords.has(w))) {
                            albumCounts.set(alb, (albumCounts.get(alb) || 0) + 1);
                        }
                    }
                }

                // 2. Process Track Title
                let fn = (it.filename || '').trim();
                if (fn) {
                    fn = fn.replace(/\.[a-z0-9]+$/i, '');
                    fn = fn.replace(/^\d+[\s._-]+/, '');
                    if (currentQuery) {
                        const qRegex = new RegExp('^' + escapeRegex(currentQuery) + '[\\s\\-_:]*', 'i');
                        fn = fn.replace(qRegex, '').trim();
                    }
                    fn = fn.replace(/\s*\(.*?\)/g, '');
                    fn = fn.replace(/\s*\[.*?\]/g, '').trim();
                    fn = fn.replace(/^\d+[\s._-]+/, '');
                    fn = fn.replace(/[\s._-]+$/, '').trim();
                    const lowFn = fn.toLowerCase();
                    if (fn.length >= 3 && fn.length <= 35 && !ignoreWords.has(lowFn)) {
                        const fnWords = lowFn.split(/\s+/).filter(Boolean);
                        if (!fnWords.every(w => queryWords.has(w))) {
                            trackCounts.set(fn, (trackCounts.get(fn) || 0) + 1);
                        }
                    }
                }
            });

            const suggestions = [];

            // Top albums
            const sortedAlbums = Array.from(albumCounts.entries())
                .filter(([_, count]) => count >= 2)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 7);

            sortedAlbums.forEach(([alb, count]) => {
                suggestions.push({ type: 'album', value: alb, label: alb, count });
            });

            // Top tracks (excluding names that match an album already)
            const albumNameSet = new Set(sortedAlbums.map(([a]) => a.toLowerCase()));
            const sortedTracks = Array.from(trackCounts.entries())
                .filter(([name, count]) => count >= 2 && !albumNameSet.has(name.toLowerCase()))
                .sort((a, b) => b[1] - a[1])
                .slice(0, 7);

            sortedTracks.forEach(([track, count]) => {
                suggestions.push({ type: 'track', value: track, label: track, count });
            });

            this.suggestedTags = suggestions;
            this.renderSuggestedChips();
        },

        renderSuggestedChips() {
            const slskSuggestedRow = document.getElementById('slskSuggestedRow');
            const slskSuggestedChips = document.getElementById('slskSuggestedChips');
            const slskClearSubFilterBtn = document.getElementById('slskClearSubFilterBtn');

            if (!slskSuggestedRow || !slskSuggestedChips) return;

            if (!this.suggestedTags || this.suggestedTags.length === 0) {
                slskSuggestedRow.style.display = 'none';
                slskSuggestedChips.innerHTML = '';
                return;
            }

            slskSuggestedRow.style.display = 'flex';
            slskSuggestedChips.innerHTML = '';

            if (slskClearSubFilterBtn) {
                slskClearSubFilterBtn.style.display = (this.activeSubFilter || this.includeFilterQuery || this.excludeFilterQuery || this.inResultFilterQuery) ? 'inline-block' : 'none';
            }

            this.suggestedTags.forEach(tag => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'slskSuggestedChip';
                if (this.activeSubFilter && this.activeSubFilter.value.toLowerCase() === tag.value.toLowerCase()) {
                    btn.classList.add('active');
                }
                btn.innerHTML = `<span class="tagLabel">${escapeHtml(tag.label)}</span><span class="tagCount">${tag.count}</span>`;
                btn.title = `Filter by ${tag.type === 'album' ? 'Album' : 'Track'}: "${tag.value}"`;

                btn.addEventListener('click', () => {
                    if (this.activeSubFilter && this.activeSubFilter.value.toLowerCase() === tag.value.toLowerCase()) {
                        // Toggle off
                        this.activeSubFilter = null;
                    } else {
                        this.activeSubFilter = { type: tag.type, value: tag.value };
                    }
                    this.renderSuggestedChips();
                    this.applyFilterAndRender();
                });

                slskSuggestedChips.appendChild(btn);
            });
        },

        getFilterTerms(queryStr) {
            if (!queryStr) return [];
            const terms = [];
            const regex = /"([^"]+)"|'([^']+)'|([^\s,]+)/g;
            let match;
            while ((match = regex.exec(queryStr)) !== null) {
                const val = (match[1] || match[2] || match[3] || '').trim().toLowerCase();
                if (val) terms.push(val);
            }
            return terms;
        },

        applyFilterAndRender() {
            let filtered = [...this.rawResults];

            // 1. Format Filter
            if (this.activeFilter === 'flac') {
                filtered = filtered.filter(item => item.isLossless || item.extension === 'FLAC');
            } else if (this.activeFilter === '320') {
                filtered = filtered.filter(item => item.isLossless || (peerBitrate(item).value ?? 0) >= 320);
            } else if (this.activeFilter === 'slots') {
                filtered = filtered.filter(item => item.freeSlots);
            }

            // 2. Suggested Sub-filter (Album / Track tag)
            if (this.activeSubFilter) {
                const targetVal = this.activeSubFilter.value.toLowerCase();
                const targetNorm = targetVal.replace(/[_.\-\s]+/g, ' ').trim();
                filtered = filtered.filter(item => {
                    const alb = (item.albumGuess || '').toLowerCase();
                    const fn = (item.filename || '').toLowerCase();
                    const fp = (item.filePath || '').toLowerCase();
                    if (alb.includes(targetVal) || fn.includes(targetVal) || fp.includes(targetVal)) return true;
                    if (targetNorm) {
                        const normStr = `${alb} ${fn} ${fp}`.replace(/[_.\-\s]+/g, ' ');
                        return normStr.includes(targetNorm);
                    }
                    return false;
                });
            }

            // 3. Include Text Filter (all tokens must match)
            const incQuery = (this.includeFilterQuery || this.inResultFilterQuery || '').trim();
            if (incQuery) {
                const incTerms = this.getFilterTerms(incQuery);
                if (incTerms.length > 0) {
                    filtered = filtered.filter(item => {
                        const target = `${item.filename || ''} ${item.filePath || ''} ${item.albumGuess || ''} ${item.artistGuess || ''} ${item.username || ''} ${item.extension || ''}`.toLowerCase();
                        return incTerms.every(term => target.includes(term));
                    });
                }
            }

            // 4. Exclude Text Filter (any token match excludes the item)
            const excQuery = (this.excludeFilterQuery || '').trim();
            if (excQuery) {
                const excTerms = this.getFilterTerms(excQuery);
                if (excTerms.length > 0) {
                    filtered = filtered.filter(item => {
                        const target = `${item.filename || ''} ${item.filePath || ''} ${item.albumGuess || ''} ${item.artistGuess || ''} ${item.username || ''} ${item.extension || ''}`.toLowerCase();
                        return !excTerms.some(term => target.includes(term));
                    });
                }
            }

            const dir = this.activeSortDir === 'asc' ? 1 : -1;

            if (this.activeSortField === 'filename') {
                filtered.sort((a, b) => dir * a.filename.localeCompare(b.filename, undefined, { sensitivity: 'base', numeric: true }));
            } else if (this.activeSortField === 'format') {
                filtered.sort((a, b) => dir * (a.extension || '').localeCompare(b.extension || ''));
            } else if (this.activeSortField === 'bitrate') {
                filtered.sort((a, b) => comparePeerBitrate(a, b, dir));
            } else if (this.activeSortField === 'size') {
                filtered.sort((a, b) => dir * ((a.size || 0) - (b.size || 0)));
            } else if (this.activeSortField === 'speed') {
                filtered.sort((a, b) => dir * ((a.speed || 0) - (b.speed || 0)));
            } else if (this.activeSortField === 'slots') {
                filtered.sort((a, b) => dir * ((a.freeSlots ? 1 : 0) - (b.freeSlots ? 1 : 0)));
            }

            const slskClearSubFilterBtn = document.getElementById('slskClearSubFilterBtn');
            if (slskClearSubFilterBtn) {
                slskClearSubFilterBtn.style.display = (this.activeSubFilter || incQuery || excQuery) ? 'inline-block' : 'none';
            }

            if (slskResultCount) {
                let filterLabel = '';
                if (this.activeSubFilter) {
                    filterLabel = ` [${this.activeSubFilter.type === 'album' ? 'ALBUM' : 'TRACK'}: "${this.activeSubFilter.value}"]`;
                }
                if (incQuery) {
                    filterLabel += ` [+INC: "${incQuery}"]`;
                }
                if (excQuery) {
                    filterLabel += ` [-EXC: "${excQuery}"]`;
                }
                slskResultCount.textContent = `${filtered.length} of ${this.rawResults.length} returned results${filterLabel}`;
            }

            if (filtered.length > 0) {
                if (slskSearchingState) slskSearchingState.style.display = 'none';
                if (slskPlaceholder) slskPlaceholder.style.display = 'none';
                this.renderRows(filtered);
            } else if (!this.isSearching) {
                if (slskSearchingState) slskSearchingState.style.display = 'none';
                if (slskResultsList) {
                    let msg = `No results matched filter "${this.activeFilter.toUpperCase()}". Try selecting All formats or a broader query.`;
                    if (this.activeSubFilter) {
                        msg = `No results matched "${this.activeSubFilter.value}". Click RESET to clear sub-filter.`;
                    } else if (this.inResultFilterQuery) {
                        msg = `No results matched "${this.inResultFilterQuery}". Clear the filter to see all results.`;
                    }
                    slskResultsList.innerHTML = `
                        <div class="slskPlaceholder">
                            <h3>No matching tracks</h3>
                            <p>${escapeHtml(msg)}</p>
                        </div>
                    `;
                }
            }
        },

        renderRows(items) {
            if (!slskResultsList) return;
            // A network search can return thousands of peer files. Bound live DOM
            // residency while keeping every returned result reachable via pagination.
            const resultFragment = document.createDocumentFragment();
            const {page, start, end: visible} = resultPageWindow(items.length, this.resultPage);
            this.resultPage = page;
            items.slice(start, visible).forEach(item => {
                const row = document.createElement('div');
                row.className = 'slskResultRow';

                let badgeClass = 'badgeOther';
                if (item.isLossless || item.extension === 'FLAC') badgeClass = 'badgeFlac';
                else if (item.extension === 'MP3') badgeClass = 'badgeMp3';

                const audioDetails = describePeerAudio(item);
                const bitrateDisplay = audioDetails.bitrate;
                const sampleRateText = audioDetails.sample;

                const queueHtml = item.freeSlots
                    ? `<span class="slskQueueVal free">✓ Free Slot</span>`
                    : `<span class="slskQueueVal queued">Queue: ${escapeHtml(item.queuePosition > 0 ? item.queuePosition : 'Unknown')}</span>`;

                row.innerHTML = `
                    <div class="col colTrack">
                        <span class="slskResultTitle" title="${escapeHtml(item.filename)}">${escapeHtml(item.filename)}</span>
                        <span class="slskResultPath" title="${escapeHtml(item.filePath)}">${escapeHtml(item.artistGuess ? item.artistGuess + ' • ' : '')}${escapeHtml(item.filePath)}</span>
                    </div>
                    <div class="slskCompactMeta">
                    <div class="col colFormat">
                        <span class="slskFormatBadge ${badgeClass}">${escapeHtml(item.extension || 'AUDIO')}</span>
                    </div>
                    <div class="col colBitrate">
                        <span class="slskBitrateVal" title="${escapeHtml(audioDetails.bitrateTitle)}">${escapeHtml(bitrateDisplay)}</span>
                        ${sampleRateText ? `<span class="slskSampleRateVal">${escapeHtml(sampleRateText)}</span>` : ''}
                    </div>
                    <div class="col colSize">
                        <span class="slskSizeVal">${escapeHtml(item.sizeFormatted)}</span>
                    </div>
                    <div class="col colPeer">
                        <span class="slskPeerUser" title="${escapeHtml(item.username)}">${escapeHtml(item.username)}</span>
                        <span class="slskPeerSpeed">${escapeHtml(item.speedFormatted)}</span>
                    </div>
                    <div class="col colQueue">
                        ${queueHtml}
                    </div>
                    </div>
                    <div class="col colAction slskActionCell">
                        <button type="button" class="slskBtn slskGetBtn" title="Queue Download">Download</button>
                        <button type="button" class="slskBtn slskBtnPrimary slskPlayBtn" title="Download & Auto-Play When Finished">Download & play</button>
                    </div>
                `;

                const getBtn = row.querySelector('.slskGetBtn');
                const playBtn = row.querySelector('.slskPlayBtn');

                getBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.queueDownload(item, false, getBtn);
                });

                playBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.queueDownload(item, true, playBtn);
                });

                resultFragment.appendChild(row);
            });
            if (items.length > SOULSEEK_RESULT_BATCH) {
                const pagination = document.createElement('div');
                pagination.className = 'slskResultPagination';
                for (const [label, step, disabled] of [['Previous', -1, start === 0], ['Next', 1, visible >= items.length]]) {
                    const button = document.createElement('button');
                    button.type = 'button'; button.className = 'slskShowMoreBtn'; button.textContent = label; button.disabled = disabled;
                    button.addEventListener('click', () => { this.resultPage += step; this.renderRows(items); });
                    pagination.append(button);
                }
                const summary = document.createElement('span'); summary.className = 'slskPaginationSummary';
                summary.textContent = `${start + 1}–${visible} of ${items.length}`;
                pagination.append(summary); resultFragment.appendChild(pagination);
            }
            slskResultsList.replaceChildren(resultFragment);
        },

        async queueDownload(item, autoPlayWhenDone, btnEl) {
            const intent = autoPlayWhenDone ? {version:playbackIntentVersion(), serial:++this.playIntentSerial} : null;
            if (btnEl) {
                btnEl.textContent = 'QUEUEING...';
                btnEl.disabled = true;
            }

            try {
                const res = await slskFetch('download', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        token: item.token || this.activeToken,
                        index: item.index,
                        username: item.username,
                        virtual_path: item.filePath,
                        size: item.size
                    })
                });
                const data = await res.json();

                if (data.ok) {
                    if (btnEl) {
                        btnEl.textContent = '✓ QUEUED';
                        btnEl.classList.add('enqueued');
                    }
                    if (autoPlayWhenDone) {
                        if (data.id != null) this.autoPlayQueue.set(String(data.id), intent);
                        this.startTransfersPolling();
                    }
                    this.pollTransfers();
                } else {
                    if (btnEl) {
                        btnEl.textContent = 'FAILED';
                        setTimeout(() => {
                            btnEl.textContent = autoPlayWhenDone ? 'Download & play' : 'Download';
                            btnEl.disabled = false;
                        }, 2500);
                    }
                }
            } catch (err) {
                console.warn('Queue download error:', err);
                if (btnEl) {
                    btnEl.textContent = 'ERROR';
                    btnEl.disabled = false;
                }
            }
        },

        activeSubView: 'results',

        setSubView(mode) {
            const nextMode = mode === 'transfers' ? 'transfers' : 'results';
            this.activeSubView = nextMode;
            const wsEl = document.getElementById('soulseekWorkspace');
            if (wsEl) {
                wsEl.setAttribute('data-slsk-subview', nextMode);
            }
            if (slskTransfersDrawer) {
                slskTransfersDrawer.classList.toggle('open', nextMode === 'transfers');
            }
            if (slskToggleTransfersBtn) {
                slskToggleTransfersBtn.classList.toggle('active', nextMode === 'transfers');
                slskToggleTransfersBtn.setAttribute('aria-pressed', nextMode === 'transfers' ? 'true' : 'false');
            }
            if (nextMode === 'transfers') {
                this.startTransfersPolling();
            } else if (!this.autoPlayQueue.size) this.stopTransfersPolling();
        },

        toggleTransfersTab() {
            this.setSubView(this.activeSubView === 'transfers' ? 'results' : 'transfers');
        },

        openTransfersDrawer() {
            this.setSubView('transfers');
        },

        closeTransfersDrawer() {
            this.setSubView('results');
        },

        startTransfersPolling() {
            if (this.transfersPollTimer) return;
            this.pollTransfers();
            this.transfersPollTimer = setInterval(() => {
                if (document.hidden) return;
                if (!this.autoPlayQueue.size
                    && (store.state.currentWorkspace !== 'soulseek' || this.activeSubView !== 'transfers')) {
                    this.stopTransfersPolling();
                    return;
                }
                this.pollTransfers();
            }, 1800);
        },

        stopTransfersPolling() {
            if (this.transfersPollTimer) {
                clearInterval(this.transfersPollTimer);
                this.transfersPollTimer = null;
            }
        },

        getTransferActionsHtml(item, isFin) {
            if (isFin) {
                return `
                    <button type="button" class="slskPlayNowBtn">PLAY NOW</button>
                    <button type="button" class="slskTransferBtn slskCancelBtn slskIconOnlyBtn" title="Remove Completed Transfer">${uiIcon('close')}</button>
                `;
            } else if (item.status === 'Paused') {
                return `
                    <button type="button" class="slskTransferBtn slskResumeBtn" title="Resume Download">RESUME</button>
                    <button type="button" class="slskTransferBtn slskCancelBtn" title="Cancel Download">CANCEL</button>
                `;
            } else if (item.status === 'Cancelled' || (item.status && item.status.startsWith('Error'))) {
                return `
                    <button type="button" class="slskTransferBtn slskResumeBtn" title="Retry Download">RETRY</button>
                    <button type="button" class="slskTransferBtn slskCancelBtn slskIconOnlyBtn" title="Remove Transfer">${uiIcon('close')}</button>
                `;
            } else {
                return `
                    <button type="button" class="slskTransferBtn slskPauseBtn" title="Pause Download">PAUSE</button>
                    <button type="button" class="slskTransferBtn slskCancelBtn" title="Cancel Download">CANCEL</button>
                `;
            }
        },

        bindTransferRowActions(row, item, isFin) {
            if (isFin) {
                const playBtn = row.querySelector('.slskPlayNowBtn');
                if (playBtn) {
                    playBtn.addEventListener('click', () => {
                        if (item.localFile) this.importAndPlay(item.localFile, true);
                        else showCachyToast("The downloaded file path is unavailable.");
                    });
                }
            }

            const pauseBtn = row.querySelector('.slskPauseBtn');
            if (pauseBtn) {
                pauseBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    pauseBtn.disabled = true;
                    pauseBtn.textContent = '...';
                    try {
                        await slskFetch('pause_download', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                id: item.id || `${item.username}:${item.virtualPath}`,
                                username: item.username,
                                virtual_path: item.virtualPath,
                                size: item.size
                            })
                        });
                        await this.pollTransfers();
                    } catch (_) {
                        pauseBtn.disabled = false;
                        pauseBtn.textContent = 'PAUSE';
                    }
                });
            }

            const resumeBtn = row.querySelector('.slskResumeBtn');
            if (resumeBtn) {
                resumeBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    resumeBtn.disabled = true;
                    resumeBtn.textContent = '...';
                    try {
                        await slskFetch('resume_download', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                id: item.id || `${item.username}:${item.virtualPath}`,
                                username: item.username,
                                virtual_path: item.virtualPath,
                                size: item.size
                            })
                        });
                        await this.pollTransfers();
                    } catch (_) {
                        resumeBtn.disabled = false;
                        resumeBtn.textContent = 'RESUME';
                    }
                });
            }

            const cancelBtn = row.querySelector('.slskCancelBtn');
            if (cancelBtn) {
                cancelBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    cancelBtn.disabled = true;
                    row.style.opacity = '0.35';
                    try {
                        await slskFetch('cancel_download', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                id: item.id || `${item.username}:${item.virtualPath}`,
                                username: item.username,
                                virtual_path: item.virtualPath
                            })
                        });
                        this.autoPlayQueue.delete(String(item.id));
                        row.remove();
                        await this.pollTransfers();
                    } catch (_) {
                        row.style.opacity = '1';
                        cancelBtn.disabled = false;
                    }
                });
            }
        },

        pollTransfers() {
            if (!this.transferRequest) {
                this.transferRequest = this.refreshTransfers().finally(() => { this.transferRequest = null; });
            }
            return this.transferRequest;
        },

        async refreshTransfers() {
            try {
                const res = await slskFetch('transfers');
                const data = await res.json();

                if (!data.ok || !Array.isArray(data.items)) return;

                const items = data.items;
                const activeCount = items.filter(it => !it.isFinished).length;

                if (slskTransferCount) slskTransferCount.textContent = activeCount.toString();
                if (slskMobileTransferCount) slskMobileTransferCount.textContent = activeCount.toString();
                if (slskTransfersSummary) slskTransfersSummary.textContent = `${activeCount} Active • ${items.length} Total`;

                const slskResumeAllBtn = document.getElementById('slskResumeAllBtn');
                const hasPaused = items.some(it => !it.isFinished && (it.status === 'Paused' || (it.status && it.status.startsWith('Error'))));
                if (slskResumeAllBtn) {
                    slskResumeAllBtn.style.display = hasPaused ? 'inline-flex' : 'none';
                    if (!slskResumeAllBtn.dataset.bound) {
                        slskResumeAllBtn.dataset.bound = 'true';
                        slskResumeAllBtn.addEventListener('click', async () => {
                            slskResumeAllBtn.disabled = true;
                            slskResumeAllBtn.textContent = 'RESUMING...';
                            try {
                                await slskFetch('resume_all', { method: 'POST' });
                                await this.pollTransfers();
                            } catch (_) {}
                            finally {
                                slskResumeAllBtn.disabled = false;
                                slskResumeAllBtn.textContent = 'RESUME ALL';
                            }
                        });
                    }
                }

                if (!slskTransfersList) return;

                if (items.length === 0) {
                    slskTransfersList.innerHTML = `<div class="slskEmptyTransfers">No active or recent transfers.</div>`;
                    return;
                }

                const emptyNotice = slskTransfersList.querySelector('.slskEmptyTransfers');
                if (emptyNotice) emptyNotice.remove();

                const validIds = new Set(items.map(it => String(it.id)));
                Array.from(slskTransfersList.children).forEach(child => {
                    const tid = child.dataset.transferId;
                    if (tid && !validIds.has(tid)) {
                        child.remove();
                    }
                });

                items.forEach(item => {
                    const itemIdStr = String(item.id);
                    const pct = clampTransferProgress(item.progress);
                    const isFin = item.isFinished || pct >= 100;
                    const statusText = (item.status === 'Paused' && pct > 0)
                        ? `Paused (${pct}% • Resumable)`
                        : `${String(item.status || 'Unknown')} (${pct}%)`;
                    const actionSignature = transferActionSignature(item);

                    let row = slskTransfersList.querySelector(`[data-transfer-id="${CSS.escape(itemIdStr)}"]`);

                    if (row) {
                        const statusEl = row.querySelector('.status');
                        const speedEl = row.querySelector('.speed');
                        const barFill = row.querySelector('.slskTransferBarFill');

                        if (statusEl && statusEl.textContent !== statusText) statusEl.textContent = statusText;
                        if (speedEl && speedEl.textContent !== item.speedFormatted) speedEl.textContent = item.speedFormatted;
                        if (barFill) {
                            barFill.style.width = `${pct}%`;
                            barFill.classList.toggle('finished', isFin);
                        }

                        if (row.dataset.lastActionSignature !== actionSignature) {
                            row.dataset.lastActionSignature = actionSignature;
                            const actionsCon = row.querySelector('.slskTransferActions');
                            if (actionsCon) {
                                actionsCon.innerHTML = this.getTransferActionsHtml(item, isFin);
                                this.bindTransferRowActions(row, item, isFin);
                            }
                        }
                    } else {
                        row = document.createElement('div');
                        row.className = 'slskTransferRow';
                        row.dataset.transferId = itemIdStr;
                        row.dataset.lastActionSignature = actionSignature;

                        row.innerHTML = `
                            <div class="slskTransferLeft">
                                <div class="slskTransferName" title="${escapeHtml(item.filename)}">${escapeHtml(item.filename)}</div>
                                <div class="slskTransferMeta">
                                    <span>${escapeHtml(item.sizeFormatted)}</span>
                                    <span class="status">${escapeHtml(statusText)}</span>
                                    <span class="speed">${escapeHtml(item.speedFormatted)}</span>
                                    <span>${escapeHtml(item.username)}</span>
                                </div>
                            </div>
                            <div class="slskTransferBarCon">
                                <div class="slskTransferBarFill ${isFin ? 'finished' : ''}" style="width: ${pct}%;"></div>
                            </div>
                            <div class="slskTransferActions">
                                ${this.getTransferActionsHtml(item, isFin)}
                            </div>
                        `;

                        this.bindTransferRowActions(row, item, isFin);
                        slskTransfersList.appendChild(row);
                    }

                    if (isFin && this.autoPlayQueue.has(String(item.id))) {
                        const intent = this.autoPlayQueue.get(String(item.id));
                        this.autoPlayQueue.delete(String(item.id));
                        const stillRequested = () => intent.serial === this.playIntentSerial && intent.version === playbackIntentVersion() && !document.hidden;
                        if (item.localFile) this.importAndPlay(item.localFile, true, stillRequested);
                    }
                    if (item.status === 'Cancelled' || item.status?.startsWith('Error')) {
                        this.autoPlayQueue.delete(String(item.id));
                    }
                });

            } catch (err) {
                console.warn('Poll transfers error:', err);
            }
        },

        async importAndPlay(filenameOrPath, autoPlay = true, stillRequested = (() => { const version = playbackIntentVersion(); return () => version === playbackIntentVersion(); })()) {
            try {
                const res = await slskFetch('import_track', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ file: filenameOrPath })
                });
                const data = await res.json();

                if (data.ok && data.track) {
                    const imported = data.track;
                    const tracks = store.state.allTracks;
                    const existingIdx = findTrackIndex(tracks, imported);
                    let targetIdx;

                    if (existingIdx !== -1) {
                        targetIdx = existingIdx;
                    } else {
                        tracks.push(imported);
                        applySearchAndSort();
                        targetIdx = tracks.length - 1;
                    }

                    if (autoPlay && stillRequested()) loadTrack(targetIdx, true);
                }
            } catch (err) {
                console.warn('Import track error:', err);
            }
        },

        async syncAllDownloadsToLibrary() {
            if (!getRuntime().hasPhpBackend) {
                showCachyToast('Syncing downloads requires a desktop PHP backend or local Folder Import.');
                return;
            }
            if (slskScanDownloadsBtn) slskScanDownloadsBtn.textContent = 'SCANNING...';
            try {
                const targetDir = this.downloadsDir || '';
                const res = await fetch('php/api/scan.php', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ directory: targetDir, preserveDirectory: true })
                });
                const data = await res.json();
                if (data.success && Array.isArray(data.tracks)) {
                    store.state.allTracks = mergeTracks(store.state.allTracks, data.tracks, t => store.state.dismissedTracksMap.has(dismissalKey(t)));
                    applySearchAndSort();
                    if (slskScanDownloadsBtn) slskScanDownloadsBtn.textContent = `✓ LOADED ${data.count} TRACKS`;
                    setTimeout(() => {
                        if (slskScanDownloadsBtn) slskScanDownloadsBtn.textContent = 'SYNC ALL TO LIBRARY';
                    }, 3000);
                }
            } catch (err) {
                console.warn('Sync downloads error:', err);
                if (slskScanDownloadsBtn) slskScanDownloadsBtn.textContent = 'SCAN FAILED';
            }
        }
    };


    let slskEventsInitialized = false;
    function initSoulseekEventListeners() {
        if (slskEventsInitialized) return;
        slskEventsInitialized = true;

        function renderSlskDiagnosticAlert(el, data = {}, fallbackMsg = 'Connection failed.') {
            if (!el) return;
            const rawErr = (typeof data === 'string' ? data : (data.error || data.message || fallbackMsg || '')).trim();
            const reason = (typeof data === 'object' && data ? data.reason : '') || '';

            let title = 'Connection Failed';
            let explanation = rawErr || fallbackMsg;

            if (reason === 'mobile_standalone' || /standalone/i.test(rawErr)) {
                title = 'Desktop Workstation Required';
                explanation = 'Soulseek requires the native app or a locally hosted desktop backend in this privacy-focused build.';
            } else if (reason === 'daemon_offline' || /port 12339|daemon|refused|could not launch/i.test(rawErr)) {
                title = 'Soulseek Service Offline';
                explanation = 'The background Nicotine+ daemon (port 12339) is offline on the host machine. Please start the Nicotine+ background service on your desktop.';
            } else if (reason === 'invalid_credentials' || /password|invalid username|invaliduserpass|credentials/i.test(rawErr)) {
                title = 'Invalid Soulseek Credentials';
                explanation = 'Incorrect username or password. Please verify your Soulseek account credentials with server.slsknet.org.';
            } else if (reason === 'network_unreachable' || /timeout|etimedout|econn|unreachable/i.test(rawErr)) {
                title = 'Network Unreachable';
                explanation = 'Could not reach server.slsknet.org (port 2242). Please check your internet connection or firewall rules.';
            }

            el.className = 'slskModalAlert error';
            el.innerHTML = `
                <div class="slskAlertTitle"><strong>${title}</strong></div>
                <div class="slskAlertBody">${explanation}</div>
            `;
            el.style.display = 'block';
        }

        function safeOpenSlskAccountModal() {
            const hostGroup = document.getElementById('slskModalHostGroup');
            if (hostGroup) {
                hostGroup.style.display = 'none';
            }
            const modal = document.getElementById('slskAccountModal');
            if (modal) {
                modal.style.display = 'flex';
                pushModalState('slskAccountModal');
            }
        }

        function safeCloseSlskAccountModal() {
            const modal = document.getElementById('slskAccountModal');
            if (modal) {
                modal.style.display = 'none';
                popModalState('slskAccountModal');
            }
        }

        // Soulseek Power Button Listeners (Toolbar & Modal)
        if (slskPowerBtn) {
            slskPowerBtn.addEventListener('click', () => {
                soulseekController.togglePower();
            });
        }

        if (slskModalPowerBtn) {
            slskModalPowerBtn.addEventListener('click', () => {
                soulseekController.togglePower();
            });
        }

        // Soulseek Account Modal Listeners
        if (slskAccountBtn) {
            slskAccountBtn.addEventListener('click', async () => {
                safeOpenSlskAccountModal();
                if (slskAccountAlert) slskAccountAlert.style.display = 'none';
                const hostInput = document.getElementById('slskModalHost');
                if (hostInput) {
                    hostInput.value = '';
                }
                if (!canReachSoulseekBackend()) return;
                try {
                    const res = await slskFetch('account');
                    const data = await res.json();
                    if (data.username && slskModalUsername) {
                        slskModalUsername.value = data.username;
                    }
                    if (slskModalPassword) {
                        slskModalPassword.value = '';
                        slskModalPassword.placeholder = data.hasPassword ? '•••••••• (Available this session)' : 'Enter password';
                    }
                    if (data.downloads_dir && slskModalDownloadDir) {
                        slskModalDownloadDir.value = data.downloads_dir;
                    } else if (soulseekController.downloadsDir && slskModalDownloadDir) {
                        slskModalDownloadDir.value = soulseekController.downloadsDir;
                    }
                    if (data.shared_dir && slskModalSharedDir) {
                        slskModalSharedDir.value = data.shared_dir;
                    } else if (soulseekController.sharedDir && slskModalSharedDir) {
                        slskModalSharedDir.value = soulseekController.sharedDir;
                    }
                    soulseekController.updatePowerUI(soulseekController.lastStatus || data);
                } catch (_) {}
            });
        }

        if (slskChangeDirBtn) {
            slskChangeDirBtn.addEventListener('click', () => {
                if (slskAccountBtn) slskAccountBtn.click();
            });
        }

        if (slskChangeSharedDirBtn) {
            slskChangeSharedDirBtn.addEventListener('click', () => {
                if (slskAccountBtn) slskAccountBtn.click();
            });
        }

        // Direct "SYNC WITH PLAYER DIR" button in Soulseek toolbar
        if (slskSyncCurrentDirBtn) {
            slskSyncCurrentDirBtn.addEventListener('click', async () => {
                let currentFolder = (folderPathInput ? folderPathInput.value : '').trim();

                // If not in input, ask scan.php for current library directory (PHP Desktop only)
                if (!currentFolder && getRuntime().hasPhpBackend) {
                    try {
                        const scanRes = await fetch('php/api/scan.php');
                        const scanData = await scanRes.json();
                        if (scanData.directory) {
                            currentFolder = scanData.directory;
                            if (folderPathInput) folderPathInput.value = currentFolder;
                        }
                    } catch (_) {}
                }

                if (!currentFolder) {
                    showCachyToast('No active server music folder found. Enter a folder path in Account Settings.');
                    return;
                }

                slskSyncCurrentDirBtn.textContent = 'SYNCING...';
                slskSyncCurrentDirBtn.disabled = true;

                try {
                    const res = await slskFetch('directory', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ directory: currentFolder })
                    });
                    const data = await res.json();

                    if (data.ok && data.downloads_dir) {
                        soulseekController.downloadsDir = data.downloads_dir;
                        if (slskDownloadsPathText) slskDownloadsPathText.textContent = data.downloads_dir;
                        if (slskModalDownloadDir) slskModalDownloadDir.value = data.downloads_dir;
                        slskSyncCurrentDirBtn.textContent = 'SYNCED!';
                        setTimeout(() => {
                            slskSyncCurrentDirBtn.textContent = 'SYNC WITH PLAYER DIR';
                            slskSyncCurrentDirBtn.disabled = false;
                        }, 1800);
                    } else {
                        showCachyToast(data.error || data.message || 'Failed to update Soulseek download folder.');
                        slskSyncCurrentDirBtn.textContent = 'SYNC WITH PLAYER DIR';
                        slskSyncCurrentDirBtn.disabled = false;
                    }
                } catch (e) {
                    console.warn('Sync dir error:', e);
                    showCachyToast('Network error communicating with Soulseek backend.');
                    slskSyncCurrentDirBtn.textContent = 'SYNC WITH PLAYER DIR';
                    slskSyncCurrentDirBtn.disabled = false;
                }
            });
        }

        // "USE PLAYER DIR" button inside the Account Settings Modal (Downloads)
        if (slskModalSyncPlayerDirBtn) {
            slskModalSyncPlayerDirBtn.addEventListener('click', async () => {
                let currentFolder = (folderPathInput ? folderPathInput.value : '').trim();
                if (!currentFolder && getRuntime().hasPhpBackend) {
                    try {
                        const scanRes = await fetch('php/api/scan.php');
                        const scanData = await scanRes.json();
                        if (scanData.directory) currentFolder = scanData.directory;
                    } catch (_) {}
                }

                if (currentFolder && slskModalDownloadDir) {
                    slskModalDownloadDir.value = currentFolder;
                } else {
                    showCachyToast('No music folder currently scanned in the player.');
                }
            });
        }

        // "USE PLAYER DIR" button inside the Account Settings Modal (Shareable)
        if (slskModalSyncSharePlayerDirBtn) {
            slskModalSyncSharePlayerDirBtn.addEventListener('click', async () => {
                let currentFolder = (folderPathInput ? folderPathInput.value : '').trim();
                if (!currentFolder && getRuntime().hasPhpBackend) {
                    try {
                        const scanRes = await fetch('php/api/scan.php');
                        const scanData = await scanRes.json();
                        if (scanData.directory) currentFolder = scanData.directory;
                    } catch (_) {}
                }

                if (currentFolder && slskModalSharedDir) {
                    slskModalSharedDir.value = currentFolder;
                } else {
                    showCachyToast('No music folder currently scanned in the player.');
                }
            });
        }

        if (slskCloseAccountModalBtn) {
            slskCloseAccountModalBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                safeCloseSlskAccountModal();
            });
            slskCloseAccountModalBtn.addEventListener('pointerdown', (e) => {
                e.stopPropagation();
            }, { passive: true });
        }

        if (slskAccountModal) {
            slskAccountModal.addEventListener('click', (e) => {
                if (e.target === slskAccountModal) {
                    safeCloseSlskAccountModal();
                }
            });
        }

        const slskModalAutoDetectHostBtn = document.getElementById('slskModalAutoDetectHostBtn');
        if (slskModalAutoDetectHostBtn) {
            slskModalAutoDetectHostBtn.addEventListener('click', () => {
                const hostInput = document.getElementById('slskModalHost');
                if (!hostInput) return;
                if (window.location.protocol.startsWith('http') && !window.location.hostname.includes('androidplatform.net')) {
                    hostInput.value = window.location.origin;
                } else {
                    const promptVal = prompt('Enter your desktop workstation IP and port (e.g. http://192.168.1.50:8000):', hostInput.value || 'http://192.168.1.');
                    if (promptVal) hostInput.value = promptVal.trim();
                }
            });
        }

        async function saveSlskAccountSettings() {
            if (!slskSaveAccountBtn || slskSaveAccountBtn.disabled) return;
            const hostInput = document.getElementById('slskModalHost');
            if (hostInput) {
                const hostVal = hostInput.value.trim().replace(/\/+$/, '');
                if (hostVal && hostVal !== window.location.origin) {
                    showCachyToast('Remote bridges are disabled in this local-only build. Use the native app or local desktop host.');
                    return;
                }
                safeStorage.setItem('cachymusic_slsk_host', hostVal);
                if (typeof AndroidBridge !== 'undefined' && typeof AndroidBridge.setSoulseekHost === 'function') {
                    try { AndroidBridge.setSoulseekHost(hostVal); } catch (_) {}
                }
            }
            const username = (slskModalUsername ? slskModalUsername.value : '').trim();
            const password = (slskModalPassword ? slskModalPassword.value : '').trim();
            const newDir = (slskModalDownloadDir ? slskModalDownloadDir.value : '').trim();
            const newSharedDir = getRuntime().isAndroidNative ? '' : (slskModalSharedDir ? slskModalSharedDir.value : '').trim();

            if (username && !confirm('Connect to Soulseek? Your IP address, account, searches and shared files may be visible to peers. Only share files you have permission to distribute.')) return;
            if (newSharedDir && newSharedDir !== soulseekController.sharedDir && !confirm('Allow Soulseek to share files from this folder? Only select material you have permission to distribute.')) return;
            slskSaveAccountBtn.textContent = 'SAVING...';
            slskSaveAccountBtn.disabled = true;

            try {
                // Update downloads directory if changed
                if (newDir && newDir !== soulseekController.downloadsDir) {
                    try {
                        const dirRes = await slskFetch('directory', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ directory: newDir })
                        });
                        const dirData = await dirRes.json();
                        if (dirData && dirData.downloads_dir) {
                            soulseekController.downloadsDir = dirData.downloads_dir;
                            if (slskDownloadsPathText) slskDownloadsPathText.textContent = dirData.downloads_dir;
                        }
                    } catch (_) {}
                }

                // Update shared directory if changed
                if (!getRuntime().isAndroidNative && newSharedDir !== soulseekController.sharedDir) {
                    try {
                        const sRes = await slskFetch('shared_directory', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ directory: newSharedDir })
                        });
                        const sData = await sRes.json();
                        if (sData && sData.shared_dir) {
                            soulseekController.sharedDir = sData.shared_dir;
                            if (slskSharedPathText) slskSharedPathText.textContent = sData.shared_dir;
                        }
                    } catch (_) {}
                }

                // Save credentials and connect
                if (username) {
                    const res = await slskFetch('login', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            username,
                            password,
                            downloads_dir: newDir,
                            shared_dir: newSharedDir
                        })
                    });
                    const data = await res.json();

                    if (data.ok) {
                        if (slskAccountAlert) {
                            slskAccountAlert.className = 'slskModalAlert success';
                            slskAccountAlert.textContent = `Connected as ${data.username || username}! Settings saved.`;
                            slskAccountAlert.style.display = 'block';
                        }
                        setTimeout(() => {
                            safeCloseSlskAccountModal();
                            soulseekController.checkStatus();
                            soulseekController.startStatusPolling();
                        }, 900);
                    } else {
                        renderSlskDiagnosticAlert(slskAccountAlert, data, 'Connection failed.');
                    }
                } else {
                    // Directory or paired host only saved
                    if (slskAccountAlert) {
                        slskAccountAlert.className = 'slskModalAlert success';
                        slskAccountAlert.textContent = 'Settings saved.';
                        slskAccountAlert.style.display = 'block';
                    }
                    setTimeout(() => {
                        safeCloseSlskAccountModal();
                        soulseekController.checkStatus();
                        soulseekController.startStatusPolling();
                    }, 900);
                }
            } catch (err) {
                renderSlskDiagnosticAlert(slskAccountAlert, {
                    error: err && err.message ? err.message : 'Network error communicating with Soulseek backend.',
                    reason: isMobileDevice ? 'mobile_standalone' : 'daemon_offline'
                }, 'Network error saving settings.');
            } finally {
                slskSaveAccountBtn.textContent = 'SAVE & CONNECT';
                slskSaveAccountBtn.disabled = false;
            }
        }

        if (slskSaveAccountBtn) {
            bindFastAction(slskSaveAccountBtn, () => {
                saveSlskAccountSettings();
            });
        }

        const slskAccountForm = document.getElementById('slskAccountForm');
        if (slskAccountForm) {
            slskAccountForm.addEventListener('submit', (e) => {
                e.preventDefault();
                saveSlskAccountSettings();
            });
        }

        const slskNoticeActionBtn = document.getElementById('slskNoticeActionBtn');
        if (slskNoticeActionBtn) {
            bindFastAction(slskNoticeActionBtn, () => {
                safeOpenSlskAccountModal();
            });
        }

        const slskNoticeConnectBtn = document.getElementById('slskNoticeConnectBtn');
        if (slskNoticeConnectBtn && slskPowerBtn) {
            bindFastAction(slskNoticeConnectBtn, () => {
                slskPowerBtn.click();
            });
        }

        if (slskLogoutBtn) {
            slskLogoutBtn.addEventListener('click', async () => {
                try {
                    await slskFetch('logout', { method: 'POST' });
                    if (slskModalUsername) slskModalUsername.value = '';
                    if (slskModalPassword) {
                        slskModalPassword.value = '';
                        slskModalPassword.placeholder = 'Enter password';
                    }
                    if (slskAccountAlert) {
                        slskAccountAlert.className = 'slskModalAlert success';
                        slskAccountAlert.textContent = 'Credentials cleared from database and disconnected.';
                        slskAccountAlert.style.display = 'block';
                    }
                    soulseekController.checkStatus();
                } catch (e) {
                    console.warn('Logout error:', e);
                }
            });
        }

        const slskSearchForm = document.getElementById('slskSearchForm');
        let lastInstantSearchTs = 0;
        let lastInstantSearchQuery = '';

        const triggerInstantSearch = () => {
            if (!slskSearchInput) return;
            const rawVal = slskSearchInput.value.trim();
            if (!rawVal) return;
            const now = Date.now();
            if (now - lastInstantSearchTs < 350 && rawVal === lastInstantSearchQuery) {
                return;
            }
            lastInstantSearchTs = now;
            lastInstantSearchQuery = rawVal;
            if (window.innerWidth <= 768) {
                slskSearchInput.blur();
                setMobileSearchPanelCollapsed(true);
            }
            soulseekController.search(rawVal);
        };

        if (slskSearchForm) {
            slskSearchForm.addEventListener('submit', (e) => {
                e.preventDefault();
                triggerInstantSearch();
            });
        }

        if (slskSearchInput) {
            const handleSearchKey = (e) => {
                if (e.isComposing) return;
                if (e.key === 'Enter' || e.code === 'Enter' || e.code === 'NumpadEnter' || e.keyCode === 13) {
                    e.preventDefault();
                    triggerInstantSearch();
                }
            };
            slskSearchInput.addEventListener('keydown', handleSearchKey);
            slskSearchInput.addEventListener('input', () => {
                if (slskSearchClearBtn) {
                    slskSearchClearBtn.style.display = slskSearchInput.value ? 'inline-flex' : 'none';
                }
            });
        }
        if (slskSearchClearBtn) {
            slskSearchClearBtn.addEventListener('click', () => {
                if (slskSearchInput) slskSearchInput.value = '';
                slskSearchClearBtn.style.display = 'none';
            });
        }
        if (slskSearchSubmitBtn) {
            slskSearchSubmitBtn.addEventListener('click', (e) => {
                e.preventDefault();
                triggerInstantSearch();
            });
        }
        if (slskFilterChips) {
            slskFilterChips.forEach(chip => {
                chip.addEventListener('click', () => {
                    slskFilterChips.forEach(c => {
                        c.classList.remove('active');
                        c.setAttribute('aria-pressed', 'false');
                    });
                    chip.classList.add('active');
                    chip.setAttribute('aria-pressed', 'true');
                    soulseekController.activeFilter = chip.dataset.filter;
                    if (slskMobileActiveFilter) {
                        const filterNames = {
                            'all': 'All',
                            'flac': 'Lossless',
                            '320': '320+',
                            'slots': 'Slots'
                        };
                        slskMobileActiveFilter.textContent = filterNames[chip.dataset.filter] || chip.dataset.filter;
                        slskMobileActiveFilter.title = chip.textContent.trim();
                        slskPanelToggleBar?.setAttribute('aria-label', `Filters: ${chip.textContent.trim()}`);
                    }
                    soulseekController.applyFilterAndRender();
                });
            });
        }

        // Include Text Filter Listeners
        if (slskIncludeFilterInput) {
            slskIncludeFilterInput.addEventListener('input', () => {
                soulseekController.includeFilterQuery = slskIncludeFilterInput.value.trim();
                soulseekController.inResultFilterQuery = soulseekController.includeFilterQuery;
                if (slskIncludeFilterClearBtn) {
                    slskIncludeFilterClearBtn.style.display = slskIncludeFilterInput.value ? 'inline-flex' : 'none';
                }
                soulseekController.applyFilterAndRender();
            });
        }

        if (slskIncludeFilterClearBtn) {
            slskIncludeFilterClearBtn.addEventListener('click', () => {
                if (slskIncludeFilterInput) slskIncludeFilterInput.value = '';
                slskIncludeFilterClearBtn.style.display = 'none';
                soulseekController.includeFilterQuery = '';
                soulseekController.inResultFilterQuery = '';
                soulseekController.applyFilterAndRender();
            });
        }

        // Exclude Text Filter Listeners
        if (slskExcludeFilterInput) {
            slskExcludeFilterInput.addEventListener('input', () => {
                soulseekController.excludeFilterQuery = slskExcludeFilterInput.value.trim();
                if (slskExcludeFilterClearBtn) {
                    slskExcludeFilterClearBtn.style.display = slskExcludeFilterInput.value ? 'inline-flex' : 'none';
                }
                soulseekController.applyFilterAndRender();
            });
        }

        if (slskExcludeFilterClearBtn) {
            slskExcludeFilterClearBtn.addEventListener('click', () => {
                if (slskExcludeFilterInput) slskExcludeFilterInput.value = '';
                slskExcludeFilterClearBtn.style.display = 'none';
                soulseekController.excludeFilterQuery = '';
                soulseekController.applyFilterAndRender();
            });
        }

        if (slskClearSubFilterBtn) {
            slskClearSubFilterBtn.addEventListener('click', () => {
                soulseekController.activeSubFilter = null;
                soulseekController.includeFilterQuery = '';
                soulseekController.excludeFilterQuery = '';
                soulseekController.inResultFilterQuery = '';
                if (slskIncludeFilterInput) slskIncludeFilterInput.value = '';
                if (slskIncludeFilterClearBtn) slskIncludeFilterClearBtn.style.display = 'none';
                if (slskExcludeFilterInput) slskExcludeFilterInput.value = '';
                if (slskExcludeFilterClearBtn) slskExcludeFilterClearBtn.style.display = 'none';
                soulseekController.renderSuggestedChips();
                soulseekController.applyFilterAndRender();
            });
        }
        // Soulseek Column Header Sorting Listeners
        const slskSortHeaders = document.querySelectorAll('.slskResultsHeader .col.sortable');
        slskSortHeaders.forEach(col => {
            col.addEventListener('click', () => {
                const sortField = col.dataset.sort;
                if (sortField) {
                    soulseekController.setSortColumn(sortField);
                }
            });
        });
        soulseekController.updateSortHeaderUI();
        if (slskStartDaemonBtn) {
            slskStartDaemonBtn.addEventListener('click', () => soulseekController.startDaemon());
        }
        if (slskRefreshStatusBtn) {
            slskRefreshStatusBtn.addEventListener('click', () => soulseekController.checkStatus());
        }
        if (slskToggleTransfersBtn) {
            slskToggleTransfersBtn.addEventListener('click', () => {
                soulseekController.toggleTransfersTab();
            });
        }
        const slskBackToResultsBtn = document.getElementById('slskBackToResultsBtn');
        if (slskBackToResultsBtn) {
            slskBackToResultsBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                soulseekController.setSubView('results');
            });
        }
        const slskTextFilterToggleBtn = document.getElementById('slskTextFilterToggleBtn');
        const slskTextFiltersCon = document.getElementById('slskTextFiltersCon');
        if (slskTextFilterToggleBtn && slskTextFiltersCon) {
            slskTextFilterToggleBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const isOpen = slskTextFiltersCon.classList.toggle('open');
                const hasText = Boolean((slskIncludeFilterInput?.value || '').trim() || (slskExcludeFilterInput?.value || '').trim());
                slskTextFilterToggleBtn.classList.toggle('active', isOpen || hasText);
                slskTextFilterToggleBtn.setAttribute('aria-expanded', String(isOpen));
            });
        }
        const slskConnectionToggleBtn = document.getElementById('slskConnectionToggleBtn');
        const slskToolbar = document.getElementById('slskToolbar');
        if (slskConnectionToggleBtn && slskToolbar) {
            slskConnectionToggleBtn.addEventListener('click', () => {
                const isOpen = slskToolbar.classList.toggle('is-open');
                slskConnectionToggleBtn.setAttribute('aria-expanded', String(isOpen));
            });
        }
        if (slskPanelToggleBar) {
            slskPanelToggleBar.addEventListener('click', (e) => {
                if (e.target.closest('#slskMobileTransfersBtn')) return;
                toggleMobileSearchPanel();
            });
        }
        if (slskMobileTransfersBtn) {
            slskMobileTransfersBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                soulseekController.toggleTransfersTab();
            });
        }
        if (slskResultsList) {
            slskResultsList.addEventListener('click', () => {
                if (window.innerWidth <= 768) {
                    if (slskTextFiltersCon && slskTextFiltersCon.classList.contains('open')) {
                        slskTextFiltersCon.classList.remove('open');
                        if (slskTextFilterToggleBtn) slskTextFilterToggleBtn.setAttribute('aria-expanded', 'false');
                        const hasText = Boolean((slskIncludeFilterInput?.value || '').trim() || (slskExcludeFilterInput?.value || '').trim());
                        if (slskTextFilterToggleBtn) slskTextFilterToggleBtn.classList.toggle('active', hasText);
                    }
                }
            });
        }
        if (slskCloseDrawerBtn) {
            slskCloseDrawerBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                soulseekController.setSubView('results');
            });
        }
        if (slskScanDownloadsBtn) {
            slskScanDownloadsBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                soulseekController.syncAllDownloadsToLibrary();
            });
        }

        // Initialize status check & conditional heartbeat
        soulseekController.checkStatus();
        soulseekController.startStatusPolling();
    }

    export {
        fetchLanStreamingUrl,
        lanUrlFetched,
        setupDownloadWorkspace,
        setupPwaInstallPrompt,
        soulseekController,
        initSoulseekEventListeners,
        triggerPwaInstallPrompt
    };
