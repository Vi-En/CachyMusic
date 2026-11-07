const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const ARTIFACTS_DIR = '/home/lien/.gemini/antigravity/brain/8ef29818-f6ab-4782-82fa-f162ed09e52c';

async function main() {
    console.log('Starting headless browser for Metadata Editor QA...');
    const braveProc = spawn('brave', [
        '--headless=new',
        '--disable-gpu',
        '--no-sandbox',
        '--remote-debugging-port=9223',
        '--user-data-dir=/tmp/brave_meta_test',
        'about:blank'
    ]);

    await new Promise(r => setTimeout(r, 1200));

    try {
        const resp = await fetch('http://127.0.0.1:9223/json');
        const pages = await resp.json();
        const wsUrl = pages[0].webSocketDebuggerUrl;
        const ws = new WebSocket(wsUrl);

        let msgId = 1;
        const send = (method, params = {}) => new Promise((resolve, reject) => {
            const id = msgId++;
            const timeout = setTimeout(() => reject(new Error(`Timeout: ${method}`)), 15000);
            const handler = (e) => {
                const data = JSON.parse(e.data);
                if (data.id === id) {
                    clearTimeout(timeout);
                    ws.removeEventListener('message', handler);
                    resolve(data.result);
                }
            };
            ws.addEventListener('message', handler);
            ws.send(JSON.stringify({ id, method, params }));
        });

        await new Promise(r => ws.onopen = r);
        console.log('Connected to CDP WebSocket.');

        await send('Page.enable');
        await send('DOM.enable');

        // ==========================================
        // 1. DESKTOP TEST (1440x900)
        // ==========================================
        console.log('\n--- 1. Testing Desktop Viewport (1440x900) ---');
        await send('Emulation.setDeviceMetricsOverride', {
            width: 1440,
            height: 900,
            deviceScaleFactor: 1,
            mobile: false
        });

        await send('Page.navigate', { url: 'http://127.0.0.1:8000/' });
        await new Promise(r => setTimeout(r, 2000));

        // Evaluate library loading and play first track or setup track
        const trackInitResult = await send('Runtime.evaluate', {
            expression: `(() => {
                if (window.allTracks && window.allTracks.length > 0) {
                    window.currentTrackIndex = 0;
                    if (typeof window.playTrack === 'function') {
                        window.playTrack(0, false);
                    }
                    return { success: true, count: window.allTracks.length, title: window.allTracks[0].title };
                }
                return { success: false, reason: 'No tracks loaded yet' };
            })()`,
            returnByValue: true
        });
        console.log('Track Init Result:', trackInitResult.result.value);

        await new Promise(r => setTimeout(r, 500));

        // Open Metadata Editor via Left Panel button
        const openMetaResult = await send('Runtime.evaluate', {
            expression: `(() => {
                const editBtn = document.getElementById('infoPanelEditMetaBtn');
                if (editBtn) {
                    editBtn.click();
                    const modal = document.getElementById('metadataEditorModal');
                    const titleInput = document.getElementById('metaEditTitle');
                    const artistInput = document.getElementById('metaEditArtist');
                    const albumInput = document.getElementById('metaEditAlbum');
                    return {
                        clicked: true,
                        modalDisplay: modal ? window.getComputedStyle(modal).display : 'null',
                        titleVal: titleInput ? titleInput.value : '',
                        artistVal: artistInput ? artistInput.value : '',
                        albumVal: albumInput ? albumInput.value : ''
                    };
                }
                return { clicked: false };
            })()`,
            returnByValue: true
        });
        console.log('Open Meta via Left Panel:', openMetaResult.result.value);

        await new Promise(r => setTimeout(r, 400));

        // Capture Desktop Screenshot with Modal Open
        const desktopShot = await send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(ARTIFACTS_DIR, 'desktop_metadata_editor.png'), Buffer.from(desktopShot.data, 'base64'));
        console.log('Saved: desktop_metadata_editor.png');

        // Test editing title and saving
        const saveResult = await send('Runtime.evaluate', {
            expression: `(() => {
                const titleInput = document.getElementById('metaEditTitle');
                const form = document.getElementById('metaEditorForm');
                if (titleInput) {
                    titleInput.value = 'Hey Daddy (Cachy Studio Master)';
                }
                if (form) {
                    form.dispatchEvent(new Event('submit', { cancelable: true }));
                    return { submitted: true };
                }
                return { submitted: false };
            })()`,
            returnByValue: true
        });
        console.log('Submit metadata form result:', saveResult.result.value);

        await new Promise(r => setTimeout(r, 1000));

        // Verify that deck and DOM updated
        const verifyUpdate = await send('Runtime.evaluate', {
            expression: `(() => {
                const deckTitle = document.getElementById('trackName');
                const leftTitle = document.getElementById('statTitle');
                const modal = document.getElementById('metadataEditorModal');
                return {
                    deckTitle: deckTitle ? deckTitle.textContent : '',
                    leftTitle: leftTitle ? leftTitle.textContent : '',
                    modalDisplay: modal ? window.getComputedStyle(modal).display : ''
                };
            })()`,
            returnByValue: true
        });
        console.log('Verify Updated Deck & Left Panel:', verifyUpdate.result.value);

        // ==========================================
        // 2. MOBILE TEST (390x844)
        // ==========================================
        console.log('\n--- 2. Testing Mobile Viewport (390x844) ---');
        await send('Emulation.setDeviceMetricsOverride', {
            width: 390,
            height: 844,
            deviceScaleFactor: 2,
            mobile: true
        });

        await send('Runtime.evaluate', {
            expression: `(() => {
                // Switch to tracks tab on mobile
                const tracksTab = document.getElementById('mobileTracksTabBtn');
                if (tracksTab) tracksTab.click();
            })()`
        });
        await new Promise(r => setTimeout(r, 600));

        // Open Track Action Menu for the first track
        const openActionMenuResult = await send('Runtime.evaluate', {
            expression: `(() => {
                if (typeof window.openTrackActionMenu === 'function' && window.allTracks && window.allTracks.length > 0) {
                    window.openTrackActionMenu(window.allTracks[0], 0);
                    const menu = document.getElementById('trackActionMenuModal');
                    return { opened: true, display: menu ? window.getComputedStyle(menu).display : '' };
                }
                return { opened: false };
            })()`,
            returnByValue: true
        });
        console.log('Open Track Action Menu Mobile:', openActionMenuResult.result.value);

        await new Promise(r => setTimeout(r, 400));

        // Click Edit Metadata from Track Action Menu
        const clickMetaFromMenu = await send('Runtime.evaluate', {
            expression: `(() => {
                const btn = document.getElementById('trackMenuEditMetaBtn');
                if (btn) {
                    btn.click();
                    const modal = document.getElementById('metadataEditorModal');
                    const formGrid = modal ? modal.querySelector('.metaEditorFormGrid') : null;
                    return {
                        clicked: true,
                        modalDisplay: modal ? window.getComputedStyle(modal).display : '',
                        gridCols: formGrid ? window.getComputedStyle(formGrid).gridTemplateColumns : ''
                    };
                }
                return { clicked: false };
            })()`,
            returnByValue: true
        });
        console.log('Trigger Meta Editor from Action Menu:', clickMetaFromMenu.result.value);

        await new Promise(r => setTimeout(r, 400));

        // Capture Mobile Screenshot (Dark Default Theme)
        const mobileShot = await send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(ARTIFACTS_DIR, 'mobile_metadata_editor_default.png'), Buffer.from(mobileShot.data, 'base64'));
        console.log('Saved: mobile_metadata_editor_default.png');

        // ==========================================
        // 3. LIGHT THEME TEST (minimalist-light)
        // ==========================================
        console.log('\n--- 3. Testing Light Theme (minimalist-light) ---');
        await send('Runtime.evaluate', {
            expression: `(() => {
                document.documentElement.setAttribute('data-theme', 'minimalist-light');
                if (typeof window.setTheme === 'function') {
                    window.setTheme('minimalist-light');
                }
            })()`
        });
        await new Promise(r => setTimeout(r, 500));

        // Capture Mobile Screenshot (Light Theme)
        const mobileLightShot = await send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(ARTIFACTS_DIR, 'mobile_metadata_editor_light.png'), Buffer.from(mobileLightShot.data, 'base64'));
        console.log('Saved: mobile_metadata_editor_light.png');

        // Close modal
        await send('Runtime.evaluate', {
            expression: `(() => {
                if (typeof window.closeMetadataEditor === 'function') window.closeMetadataEditor();
            })()`
        });

        console.log('\nAll QA tests completed successfully!');
        ws.close();
    } finally {
        braveProc.kill();
    }
}

main().catch(err => {
    console.error('Error during QA testing:', err);
    process.exit(1);
});
