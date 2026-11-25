import { requireSoulseekSuccess } from './soulseek-transport.js';
import { isMobileDevice, popModalState, pushModalState, safeStorage, showCachyToast } from './utils.js';
import { canReachSoulseekBackend, slskFetch } from './soulseek-client.js';
import { getRuntime } from './runtime-capabilities.js';
import { bindFastAction, folderPathInput, setMobileSearchPanelCollapsed, slskAccountAlert, slskAccountBtn, slskAccountModal, slskChangeDirBtn, slskChangeSharedDirBtn, slskClearSubFilterBtn, slskCloseAccountModalBtn, slskCloseDrawerBtn, slskDownloadsPathText, slskExcludeFilterClearBtn, slskExcludeFilterInput, slskFilterChips, slskIncludeFilterClearBtn, slskIncludeFilterInput, slskLogoutBtn, slskMobileActiveFilter, slskMobileTransfersBtn, slskModalDownloadDir, slskModalPassword, slskModalPowerBtn, slskModalSharedDir, slskModalSyncPlayerDirBtn, slskModalSyncSharePlayerDirBtn, slskModalUsername, slskPanelToggleBar, slskPowerBtn, slskRefreshStatusBtn, slskResultsList, slskSaveAccountBtn, slskScanDownloadsBtn, slskSearchClearBtn, slskSearchInput, slskSearchSubmitBtn, slskSharedPathText, slskStartDaemonBtn, slskSyncCurrentDirBtn, slskToggleTransfersBtn, toggleMobileSearchPanel } from './ui-elements.js';

export function renderSlskDiagnosticAlert(el, data = {}, fallbackMsg = 'Connection failed.') {
    if (!el) return;
    const rawErr = String(typeof data === 'string' ? data : (data?.error || data?.message || fallbackMsg || '')).trim();
    const reason = (typeof data === 'object' && data ? data.reason : '') || '';

    let title = 'Connection Failed';
    let explanation = rawErr || fallbackMsg;

    if (reason === 'mobile_standalone' || /standalone/i.test(rawErr)) {
        title = 'Soulseek backend required';
        explanation = 'Soulseek requires the native app or a locally hosted desktop backend in this privacy-focused build.';
    } else if (reason === 'daemon_offline' || /port 12339|daemon|refused|could not launch/i.test(rawErr)) {
        title = 'Soulseek Service Offline';
        explanation = 'The local Soulseek service is unavailable. Check that the desktop backend is running.';
    } else if (reason === 'invalid_credentials' || /password|invalid username|invaliduserpass|credentials/i.test(rawErr)) {
        title = 'Invalid Soulseek Credentials';
        explanation = 'Incorrect username or password. Please verify your Soulseek account credentials with server.slsknet.org.';
    } else if (reason === 'network_unreachable' || /timeout|etimedout|econn|unreachable/i.test(rawErr)) {
        title = 'Network Unreachable';
        explanation = 'Could not reach server.slsknet.org (port 2242). Please check your internet connection or firewall rules.';
    }

    el.className = 'slskModalAlert error';
    const heading = el.ownerDocument.createElement('div');
    heading.className = 'slskAlertTitle';
    const strong = el.ownerDocument.createElement('strong');
    strong.textContent = title;
    heading.append(strong);
    const body = el.ownerDocument.createElement('div');
    body.className = 'slskAlertBody';
    body.textContent = explanation;
    el.replaceChildren(heading, body);
    el.style.display = 'block';
}


// DOM interaction bindings for the Soulseek workspace.
    let slskEventsInitialized = false;
    export function initSoulseekEventListeners(soulseekController) {
        if (slskEventsInitialized) return;
        slskEventsInitialized = true;

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
                if (typeof window.AndroidBridge?.setSoulseekHost === 'function') {
                    try { window.AndroidBridge.setSoulseekHost(hostVal); } catch (_) {}
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
                    requireSoulseekSuccess(await (await slskFetch('logout', { method: 'POST' })).json());
                    soulseekController.autoPlayQueue.clear();
                    soulseekController.transferGeneration++;
                    soulseekController.transferRequest = null;
                    soulseekController.playIntentSerial++;
                    soulseekController.searchGeneration++;
                    clearTimeout(soulseekController.searchPollTimer);
                    soulseekController.searchPollTimer = null;
                    soulseekController.isSearching = false;
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
                    showCachyToast(e.message || 'Logout failed');
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

