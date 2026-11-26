import {requestServerScan} from './server-scan.js';
import { initSoulseekEventListeners as bindSoulseekControls, renderSlskDiagnosticAlert } from './soulseek-controls.js';
import { requireSoulseekSuccess, downloadTransferId } from './soulseek-transport.js';
import { findTrackIndex, mergeTracks, dismissalKey } from './track-session.js';
import { describePeerAudio, comparePeerBitrate, peerBitrate } from './soulseek-result-metadata.js';
import { uiIcon } from './icons.js';
import { SOULSEEK_RESULT_BATCH, resultPageWindow, clampTransferProgress, transferActionSignature, isTransferFinished, isTransferPlayable } from './soulseek-ui-budget.js';
// CachyMusic - P2P Network, Downloads & PWA Integration
import { escapeHtml, escapeRegex, showCachyToast } from './utils.js';
import { store } from './state.js';
import { canReachSoulseekBackend, slskFetch } from './soulseek-client.js';
import { getRuntime } from './runtime-capabilities.js';
import { applySearchAndSort } from './library.js';
import { loadTrack, playbackIntentVersion } from './player-core.js';
import { setMobileSearchPanelCollapsed, slskAccountAlert, slskAccountBtn, slskActiveSearchMeta, slskChangeDirBtn, slskChangeSharedDirBtn, slskClearSubFilterBtn, slskDownloadsPathText, slskExcludeFilterInput, slskIncludeFilterInput, slskMobileTransferCount, slskModalPowerBtn, slskModalUsername, slskPlaceholder, slskPowerBtn, slskPowerBtnText, slskResultCount, slskResultsList, slskScanDownloadsBtn, slskSearchingState, slskSearchingTitle, slskSharedPathText, slskStartDaemonBtn, slskStatusDot, slskStatusText, slskSuggestedChips, slskSuggestedRow, slskToggleTransfersBtn, slskTransferCount, slskTransfersDrawer, slskTransfersList, slskTransfersSummary, slskUsername, soulseekWorkspace, wsSoulseekBadge } from './ui-elements.js';

    // =========================================================================
    // Soulseek Controller - Nicotine+ REST Engine
    // =========================================================================
const filenameCollator=new Intl.Collator(undefined,{sensitivity:'base',numeric:true});
function updateConnectionLabel(text) {
    const element = document.getElementById('slskStatusText');
    if (element && element.textContent !== text) element.textContent = text;
    const mobile=document.getElementById('slskMobileStatusDot');if(mobile)mobile.setAttribute('aria-label',`Connection settings: ${text}`);
}

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
        statusGeneration: 0,
        transferRequest: null,
        transferGeneration: 0,
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

            const mobileLabel=document.getElementById('slskMobileStatusLabel');if(mobileLabel)mobileLabel.textContent=isConnBusy?'Connecting':isConn?'Online':'Offline';
            if (slskPowerBtn) {
                slskPowerBtn.classList.remove('power-on', 'power-off', 'busy');
                if (isConnBusy) {
                    slskPowerBtn.classList.add('busy');
                    if (slskPowerBtnText) slskPowerBtnText.textContent = 'Connecting…';
                    slskPowerBtn.disabled = true;
                    slskPowerBtn.title = 'Connecting to Soulseek network...';
                } else if (isConn) {
                    slskPowerBtn.classList.add('power-on');
                    if (slskPowerBtnText) slskPowerBtnText.textContent = 'Disconnect';
                    slskPowerBtn.disabled = false;
                    slskPowerBtn.title = 'Online. Click to Disconnect (disconnects and stops sharing files)';
                } else {
                    slskPowerBtn.classList.add('power-off');
                    if (slskPowerBtnText) slskPowerBtnText.textContent = 'Connect';
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
                    slskModalPowerBtn.textContent = 'Connecting…';
                    slskModalPowerBtn.disabled = true;
                } else if (isConn) {
                    slskModalPowerBtn.classList.add('power-on');
                    slskModalPowerBtn.textContent = 'Disconnect';
                    slskModalPowerBtn.disabled = false;
                } else {
                    slskModalPowerBtn.textContent = 'Connect';
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
                slskPowerBtnText.textContent = targetState === 'on' ? 'Connecting…' : 'Disconnecting…';
            }
            if (slskModalPowerBtn) {
                slskModalPowerBtn.disabled = true;
                slskModalPowerBtn.textContent = targetState === 'on' ? 'Connecting…' : 'Disconnecting…';
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
            const generation = ++this.statusGeneration;
            try {
                const res = await slskFetch('status');
                const data = await res.json();
                if (generation !== this.statusGeneration) return;
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
                    updateConnectionLabel('SOULSEEK REQUIRES APP PACKAGE');
                    if (wsSoulseekBadge) wsSoulseekBadge.className = 'wsBadge offline';
                    if (slskUsername) slskUsername.textContent = 'Install the packaged app';
                    if (slskStartDaemonBtn) slskStartDaemonBtn.style.display = 'none';
                } else if (data.ok && data.daemon_running !== false) {
                    if (data.connected) {
                        if (slskStatusDot) slskStatusDot.className = 'slskStatusDot online';
                        updateConnectionLabel(`ONLINE: ${data.login_username}`);
                        if (wsSoulseekBadge) wsSoulseekBadge.className = 'wsBadge online';
                        if (slskUsername) slskUsername.textContent = data.login_username;
                    } else if (data.connecting) {
                        if (slskStatusDot) slskStatusDot.className = 'slskStatusDot busy';
                        updateConnectionLabel('CONNECTING TO SOULSEEK...');
                        if (wsSoulseekBadge) wsSoulseekBadge.className = 'wsBadge busy';
                        if (slskUsername) slskUsername.textContent = `${data.login_username} (Connecting)`;
                    } else if (data.has_credentials) {
                        if (slskStatusDot) slskStatusDot.className = 'slskStatusDot offline';
                        updateConnectionLabel(data.error ? `AUTH FAILED: ${data.error}` : `${clientLabel} OFFLINE (DISCONNECTED)`);
                        if (wsSoulseekBadge) wsSoulseekBadge.className = 'wsBadge offline';
                        if (slskUsername) slskUsername.textContent = `${data.login_username} (Offline)`;
                    } else {
                        if (slskStatusDot) slskStatusDot.className = 'slskStatusDot offline';
                        updateConnectionLabel('NOT CONFIGURED (CLICK SETTINGS)');
                        if (wsSoulseekBadge) wsSoulseekBadge.className = 'wsBadge offline';
                        if (slskUsername) slskUsername.textContent = 'Not configured';
                    }
                    if (slskStartDaemonBtn) slskStartDaemonBtn.style.display = 'none';
                } else if (data.daemon_running) {
                    if (slskStatusDot) slskStatusDot.className = 'slskStatusDot busy';
                    updateConnectionLabel(`${clientLabel} INITIALIZING...`);
                    if (wsSoulseekBadge) wsSoulseekBadge.className = 'wsBadge busy';
                    if (slskStartDaemonBtn) slskStartDaemonBtn.style.display = 'none';
                } else {
                    if (slskStatusDot) slskStatusDot.className = 'slskStatusDot offline';
                    updateConnectionLabel(`${clientLabel} OFFLINE`);
                    if (wsSoulseekBadge) wsSoulseekBadge.className = 'wsBadge offline';
                    if (slskStartDaemonBtn) {
                        slskStartDaemonBtn.style.display = 'inline-block';
                        slskStartDaemonBtn.disabled = false;
                        slskStartDaemonBtn.textContent = `Start ${clientLabel}`;
                    }
                }
            } catch (err) {
                if (generation !== this.statusGeneration) return;
                this.lastStatus = {ok:false, reason:'request_failed'};
                this.updatePowerUI(this.lastStatus);
                console.warn('Soulseek status error:', err);
                if (slskStatusDot) slskStatusDot.className = 'slskStatusDot offline';
                updateConnectionLabel('REST API OFFLINE');
                if (wsSoulseekBadge) wsSoulseekBadge.className = 'wsBadge offline';
                if (slskStartDaemonBtn) {
                    slskStartDaemonBtn.style.display = getRuntime().hasPhpBackend ? 'inline-block' : 'none';
                    slskStartDaemonBtn.disabled = false;
                    slskStartDaemonBtn.textContent = 'Start Soulseek';
                }
            } finally {
                if (generation === this.statusGeneration) {
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

                        if (statusObj.reason === 'request_failed') {
                            nTitle = 'Connection status unavailable';
                            nMsg = 'The status request failed. Refresh before attempting another operation.';
                        } else if (statusObj.standalone) {
                            nTitle = 'Standalone PWA Mode';
                            nMsg = 'Soulseek P2P requires a paired CachyMusic Desktop Host (LAN IP) in Account Settings, or use local device music files.';
                        } else if (statusObj.reason === 'mobile_standalone') {
                            nTitle = 'Soulseek Standalone Mode';
                            nMsg = 'Soulseek is currently disconnected. Click Settings to enter credentials and connect directly to the Soulseek network.';
                        } else if (!statusObj.daemon_running || (statusObj.error && /12339|daemon|refused/i.test(statusObj.error))) {
                            nTitle = 'Soulseek service unavailable';
                            nMsg = 'The local Soulseek service is unavailable. Check the desktop backend and start the service if needed.';
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
            updateConnectionLabel('LAUNCHING DAEMON...');
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
            slskResultsList?.removeAttribute('aria-busy');
            if (!slskResultsList) return;
            slskResultsList.setAttribute('aria-label', 'Search results, searching');
            slskResultsList.innerHTML = `
                <div class="slskSearchingState" role="status" id="slskSearchingState">
                    <h3 id="slskSearchingTitle">Searching Soulseek…</h3>
                    <p>Looking for “${escapeHtml(query)}”</p>
                    <p id="slskSearchingPeerStatus">${escapeHtml(statusText)}</p>
                </div>`;
        },

        renderNoResultsFound(query, failed = false) {
            slskResultsList?.removeAttribute('aria-busy');
            if (!slskResultsList) return;
            slskResultsList.setAttribute('aria-label', failed ? 'Search results unavailable' : 'Search results, none');
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

        setSortColumn(field, direction) {
            if(!['filename','format','bitrate','size','speed','slots'].includes(field))return;
            if(direction==='asc'||direction==='desc'){this.activeSortField=field;this.activeSortDir=direction;this.updateSortHeaderUI();this.applyFilterAndRender();return;}
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
            const fieldSelect=document.getElementById('slskMobileSortField'), directionBtn=document.getElementById('slskMobileSortDir');
            if(fieldSelect)fieldSelect.value=this.activeSortField;
            if(directionBtn){directionBtn.textContent=this.activeSortDir==='asc'?'Ascending':'Descending';directionBtn.setAttribute('aria-label',`${directionBtn.textContent} order; change direction`);}
            const headerCols = document.querySelectorAll('.slskResultsHeader .col.sortable');
            headerCols.forEach(col => {
                const field = col.dataset.sort;
                const indicator = col.querySelector('.sortIndicator');
                col.setAttribute('aria-pressed',String(field===this.activeSortField));
                col.setAttribute('aria-label',`${col.querySelector('span')?.textContent || field}${field===this.activeSortField?`, ${this.activeSortDir==='asc'?'ascending':'descending'}`:''}`);
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
            const raw=this.rawResults,searchGeneration=this.searchGeneration,revision=(this.filterRevision||0)+1;
            this.filterRevision=revision;
            const current=()=>this.filterRevision===revision&&this.searchGeneration===searchGeneration&&this.rawResults===raw;
            const incQuery=(this.includeFilterQuery||this.inResultFilterQuery||'').trim(),excQuery=(this.excludeFilterQuery||'').trim();
            const incTerms=this.getFilterTerms(incQuery),excTerms=this.getFilterTerms(excQuery),format=this.activeFilter;
            const sub=this.activeSubFilter?.value.toLowerCase()||'',norm=sub.replace(/[_.\-\s]+/g,' ').trim();
            const match=item=>{
                if(format==='flac'&&!item.isLossless&&item.extension!=='FLAC')return false;
                if(format==='320'&&!item.isLossless&&(peerBitrate(item).value??0)<320)return false;
                if(format==='slots'&&!item.freeSlots)return false;
                if(sub){const text=`${item.albumGuess||''} ${item.filename||''} ${item.filePath||''}`.toLowerCase();if(!text.includes(sub)&&(!norm||!text.replace(/[_.\-\s]+/g,' ').includes(norm)))return false;}
                if(incTerms.length||excTerms.length){const text=`${item.filename||''} ${item.filePath||''} ${item.albumGuess||''} ${item.artistGuess||''} ${item.username||''} ${item.extension||''}`.toLowerCase();if(!incTerms.every(term=>text.includes(term))||excTerms.some(term=>text.includes(term)))return false;}
                return true;
            };
            const dir=this.activeSortDir==='asc'?1:-1,field=this.activeSortField;
            const compare=(a,b)=>field==='filename'?dir*filenameCollator.compare(a.filename,b.filename):field==='format'?dir*(a.extension||'').localeCompare(b.extension||''):field==='bitrate'?comparePeerBitrate(a,b,dir):field==='size'?dir*((a.size||0)-(b.size||0)):field==='speed'?dir*((a.speed||0)-(b.speed||0)):field==='slots'?dir*(Number(!!a.freeSlots)-Number(!!b.freeSlots)):0;
            const publish=filtered=>{if(!current())return;slskResultsList?.removeAttribute('aria-busy');this.publishFilteredResults(filtered,incQuery,excQuery);};
            if(raw.length<=1000){publish(raw.filter(match).sort(compare));return;}
            if(slskResultsList){slskResultsList.setAttribute('aria-busy','true');slskResultsList.replaceChildren();}
            if(slskResultCount)slskResultCount.textContent='Filtering results…';
            const yieldTurn=()=>typeof globalThis.scheduler?.yield==='function'?globalThis.scheduler.yield():new Promise(resolve=>setTimeout(resolve,0));
            return (async()=>{
                const runs=[];for(let i=0;i<raw.length;i+=512){if(!current())return;runs.push(raw.slice(i,i+512).filter(match).sort(compare));await yieldTurn();}
                // Stable merge: each chunk's original order and equal-key order are preserved.
                while(runs.length>1){const next=[];for(let i=0;i<runs.length;i+=2){if(!current())return;const left=runs[i],right=runs[i+1];if(!right){next.push(left);continue;}let a=0,b=0;const merged=[];while(a<left.length&&b<right.length){merged.push(compare(left[a],right[b])<=0?left[a++]:right[b++]);if(merged.length%2048===0){await yieldTurn();if(!current())return;}}next.push(merged.concat(left.slice(a),right.slice(b)));await yieldTurn();}runs.splice(0,runs.length,...next);}
                publish(runs[0]||[]);
            })().catch(()=>{if(current()){slskResultsList?.removeAttribute('aria-busy');if(slskResultCount)slskResultCount.textContent='Could not filter results. Change a filter to retry.';}});
        },

        publishFilteredResults(filtered,incQuery,excQuery) {
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
                    slskResultsList.setAttribute('aria-label', 'Search results, no matches');
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
                    button.addEventListener('click', () => {
                        this.resultPage += step;
                        this.renderRows(items);
                        // An explicit page change is navigation: announce the new range,
                        // start at its first result, and retain a predictable Tab order.
                        slskResultsList.scrollTop = 0;
                        slskResultsList.focus({preventScroll:true});
                    });
                    pagination.append(button);
                }
                const summary = document.createElement('span'); summary.className = 'slskPaginationSummary';
                summary.textContent = `${start + 1}–${visible} of ${items.length}`;
                pagination.append(summary); resultFragment.appendChild(pagination);
            }
            slskResultsList.replaceChildren(resultFragment);
            slskResultsList.setAttribute('aria-label', items.length ? `Search results, ${start + 1}–${visible} of ${items.length}` : 'Search results, none');
        },

        async queueDownload(item, autoPlayWhenDone, btnEl) {
            const intent = autoPlayWhenDone ? {version:playbackIntentVersion(), serial:++this.playIntentSerial} : null;
            if (intent) this.autoPlayQueue.clear();
            if (btnEl) {
                btnEl.textContent = 'Queueing…';
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
                        btnEl.textContent = 'Queued';
                        btnEl.classList.add('enqueued');
                    }
                    if (autoPlayWhenDone) {
                        const transferId = downloadTransferId(data);
                        if (transferId !== null && intent.serial === this.playIntentSerial && intent.version === playbackIntentVersion()) {
                            this.autoPlayQueue.set(transferId, intent);
                            this.startTransfersPolling();
                        } else if (transferId === null) showCachyToast("Download queued, but its transfer ID is unavailable. Play it from Transfers when ready.");
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
                for (const [id, intent] of this.autoPlayQueue) {
                    if (intent.serial !== this.playIntentSerial || intent.version !== playbackIntentVersion()) this.autoPlayQueue.delete(id);
                }
                if (!this.autoPlayQueue.size
                    && (store.state.currentWorkspace !== 'soulseek' || this.activeSubView !== 'transfers')) {
                    this.stopTransfersPolling();
                    return;
                }
                if (!document.hidden) this.pollTransfers();
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
                    ${isTransferPlayable(item) ? '<button type="button" class="slskPlayNowBtn">Play</button>' : '<span class="status">File unavailable</span>'}
                    <button type="button" class="slskTransferBtn slskCancelBtn slskIconOnlyBtn" title="Remove Completed Transfer">${uiIcon('close')}</button>
                `;
            } else if (item.status === 'Paused') {
                return `
                    <button type="button" class="slskTransferBtn slskResumeBtn" title="Resume Download">Resume</button>
                    <button type="button" class="slskTransferBtn slskCancelBtn" title="Cancel Download">Cancel</button>
                `;
            } else if (item.status === 'Cancelled') {
                return `
                    <button type="button" class="slskTransferBtn slskCancelBtn slskIconOnlyBtn" title="Remove Transfer">${uiIcon('close')}</button>
                `;
            } else if (/^(Error|Denied|Busy)/.test(item.status || '')) {
                return `<button type="button" class="slskTransferBtn slskResumeBtn" title="Retry Download">Retry</button>
                    <button type="button" class="slskTransferBtn slskCancelBtn slskIconOnlyBtn" title="Remove Transfer">${uiIcon('close')}</button>`;
            } else {
                return `
                    <button type="button" class="slskTransferBtn slskPauseBtn" title="Pause Download">Pause</button>
                    <button type="button" class="slskTransferBtn slskCancelBtn" title="Cancel Download">Cancel</button>
                `;
            }
        },

        bindTransferRowActions(row, item, isFin) {
            if (isFin) {
                const playBtn = row.querySelector('.slskPlayNowBtn');
                if (playBtn) {
                    playBtn.addEventListener('click', () => {
                        if (isTransferPlayable(item)) this.importAndPlay(item.localFile, true);
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
                        requireSoulseekSuccess(await (await slskFetch('pause_download', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                id: item.id || `${item.username}:${item.virtualPath}`,
                                username: item.username,
                                virtual_path: item.virtualPath,
                                size: item.size
                            })
                        })).json());
                        await this.pollTransfers();
                    } catch (err) {
                        showCachyToast(err.message || 'Pause failed');
                    } finally {
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
                        requireSoulseekSuccess(await (await slskFetch('resume_download', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                id: item.id || `${item.username}:${item.virtualPath}`,
                                username: item.username,
                                virtual_path: item.virtualPath,
                                size: item.size
                            })
                        })).json());
                        await this.pollTransfers();
                    } catch (err) {
                        showCachyToast(err.message || 'Resume failed');
                    } finally {
                        resumeBtn.disabled = false;
                        resumeBtn.textContent = item.status === 'Paused' ? 'RESUME' : 'RETRY';
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
                        requireSoulseekSuccess(await (await slskFetch('cancel_download', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                id: item.id || `${item.username}:${item.virtualPath}`,
                                username: item.username,
                                virtual_path: item.virtualPath
                            })
                        })).json());
                        this.autoPlayQueue.delete(String(item.id));
                        row.remove();
                        await this.pollTransfers();
                    } catch (err) {
                        showCachyToast(err.message || 'Cancel failed');
                        row.style.opacity = '1';
                        cancelBtn.disabled = false;
                    }
                });
            }
        },

        pollTransfers() {
            if (!this.transferRequest) {
                const request = this.refreshTransfers(this.transferGeneration);
                this.transferRequest = request;
                request.finally(() => { if (this.transferRequest === request) this.transferRequest = null; });
            }
            return this.transferRequest;
        },

        async refreshTransfers(generation = this.transferGeneration) {
            try {
                const res = await slskFetch('transfers');
                const data = await res.json();

                if (generation !== this.transferGeneration || !data.ok || !Array.isArray(data.items)) return;

                const items = data.items;
                const activeCount = items.filter(it => !isTransferFinished(it)).length;

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
                            slskResumeAllBtn.textContent = 'Resuming…';
                            try {
                                requireSoulseekSuccess(await (await slskFetch('resume_all', { method: 'POST' })).json());
                                await this.pollTransfers();
                            } catch (err) { showCachyToast(err.message || 'Resume all failed'); }
                            finally {
                                slskResumeAllBtn.disabled = false;
                                slskResumeAllBtn.textContent = 'Resume all';
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
                    const isFin = isTransferFinished(item);
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
                            barFill.parentElement.setAttribute('aria-valuenow',String(pct));
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
                            <div class="slskTransferBarCon" role="progressbar" aria-label="Download progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}">
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
                        if (isTransferPlayable(item) && stillRequested()) this.importAndPlay(item.localFile, true, stillRequested);
                        else if (!isTransferPlayable(item)) showCachyToast("Download completed, but the audio file is unavailable.");
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

                    if (autoPlay && stillRequested()) loadTrack(targetIdx,true,0,null,false,false,null);
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
            if (slskScanDownloadsBtn) slskScanDownloadsBtn.textContent = 'Scanning…';
            try {
                const targetDir = this.downloadsDir || '';
                if(!targetDir.trim())throw Error('Configure the downloads directory first.');
                const data=await requestServerScan({directory:targetDir,preserveDirectory:true});
                if (!data.success) throw Error(data.message||'Scan failed');
                if (data.success && Array.isArray(data.tracks)) {
                    store.state.allTracks = mergeTracks(store.state.allTracks, data.tracks, t => store.state.dismissedTracksMap.has(dismissalKey(t)));
                    applySearchAndSort();
                    if (slskScanDownloadsBtn) slskScanDownloadsBtn.textContent = `✓ LOADED ${data.count} TRACKS`;
                    setTimeout(() => {
                        if (slskScanDownloadsBtn) slskScanDownloadsBtn.textContent = 'Add downloads to library';
                    }, 3000);
                }
            } catch (err) {
                console.warn('Sync downloads error:', err);
                if (slskScanDownloadsBtn) slskScanDownloadsBtn.textContent = 'Scan failed';
            }
        }
    };


    function initSoulseekEventListeners() { bindSoulseekControls(soulseekController); }

    export {
        soulseekController,
        initSoulseekEventListeners
    };
