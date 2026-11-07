const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const ARTIFACTS_DIR = '/home/lien/.gemini/antigravity/brain/8ef29818-f6ab-4782-82fa-f162ed09e52c';

async function main() {
    const braveProc = spawn('brave', [
        '--headless=new',
        '--disable-gpu',
        '--no-sandbox',
        '--remote-debugging-port=9225',
        '--user-data-dir=/tmp/brave_mobile_meta',
        'about:blank'
    ]);

    await new Promise(r => setTimeout(r, 1200));

    try {
        const resp = await fetch('http://127.0.0.1:9225/json');
        const pages = await resp.json();
        const ws = new WebSocket(pages[0].webSocketDebuggerUrl);

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
        await send('Page.enable');
        await send('DOM.enable');

        // Mobile viewport (Infinix Note 30 reference: 390x844 @ 2x)
        await send('Emulation.setDeviceMetricsOverride', {
            width: 390,
            height: 844,
            deviceScaleFactor: 2,
            mobile: true
        });

        await send('Page.navigate', { url: 'http://127.0.0.1:8000/' });
        await new Promise(r => setTimeout(r, 2000));

        // 1. Go to tracks tab
        await send('Runtime.evaluate', {
            expression: `(() => {
                const b = document.getElementById('mobileTracksTabBtn');
                if (b) b.click();
            })()`
        });
        await new Promise(r => setTimeout(r, 600));

        // 2. Open action menu for track 0
        await send('Runtime.evaluate', {
            expression: `(() => {
                if (window.allTracks && window.allTracks.length > 0) {
                    window.openTrackActionMenu(window.allTracks[0], 0);
                }
            })()`
        });
        await new Promise(r => setTimeout(r, 400));

        // 3. Click Edit Metadata in action menu
        await send('Runtime.evaluate', {
            expression: `(() => {
                const btn = document.getElementById('trackMenuEditMetaBtn');
                if (btn) btn.click();
            })()`
        });
        await new Promise(r => setTimeout(r, 500));

        // 4. Capture screenshot of dark theme metadata editor on mobile
        const darkShot = await send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(ARTIFACTS_DIR, 'mobile_metadata_editor_dark.png'), Buffer.from(darkShot.data, 'base64'));
        console.log('Saved: mobile_metadata_editor_dark.png');

        // 5. Switch to minimalist-warm theme
        await send('Runtime.evaluate', {
            expression: `(() => {
                document.documentElement.setAttribute('data-theme', 'minimalist-warm');
                if (typeof window.setTheme === 'function') {
                    window.setTheme('minimalist-warm');
                }
            })()`
        });
        await new Promise(r => setTimeout(r, 500));

        // 6. Capture screenshot of minimalist-warm metadata editor on mobile
        const warmShot = await send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(ARTIFACTS_DIR, 'mobile_metadata_editor_warm.png'), Buffer.from(warmShot.data, 'base64'));
        console.log('Saved: mobile_metadata_editor_warm.png');

        // 7. Edit genre, click save button on mobile
        const mobileSave = await send('Runtime.evaluate', {
            expression: `(async () => {
                const genreInput = document.getElementById('metaEditGenre');
                if (genreInput) genreInput.value = 'Contemporary R&B / Soul';
                await window.saveMetadata();
                const modal = document.getElementById('metadataEditorModal');
                const toast = document.getElementById('toast');
                return {
                    closed: modal ? modal.style.display === 'none' : false,
                    toastText: toast ? toast.textContent : ''
                };
            })()`,
            awaitPromise: true,
            returnByValue: true
        });
        console.log('Mobile save result:', mobileSave.result.value);

        await new Promise(r => setTimeout(r, 300));
        const postSaveShot = await send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(ARTIFACTS_DIR, 'mobile_metadata_saved_toast.png'), Buffer.from(postSaveShot.data, 'base64'));
        console.log('Saved: mobile_metadata_saved_toast.png');

        ws.close();
        console.log('Mobile flow test finished successfully!');
    } finally {
        braveProc.kill();
    }
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
