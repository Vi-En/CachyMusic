const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const ARTIFACTS_DIR = '/home/lien/.gemini/antigravity/brain/8ef29818-f6ab-4782-82fa-f162ed09e52c';

async function main() {
    const braveProc = spawn('brave', [
        '--headless=new',
        '--disable-gpu',
        '--no-sandbox',
        '--remote-debugging-port=9224',
        '--user-data-dir=/tmp/brave_meta_test2',
        'about:blank'
    ]);

    await new Promise(r => setTimeout(r, 1200));

    try {
        const resp = await fetch('http://127.0.0.1:9224/json');
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

        await send('Emulation.setDeviceMetricsOverride', {
            width: 1440,
            height: 900,
            deviceScaleFactor: 1,
            mobile: false
        });

        await send('Page.navigate', { url: 'http://127.0.0.1:8000/' });
        await new Promise(r => setTimeout(r, 2000));

        // Test opening modal and saving
        const result = await send('Runtime.evaluate', {
            expression: `(async () => {
                try {
                    // Open modal for track 0
                    const track = window.allTracks && window.allTracks[0];
                    if (!track) return { err: 'no tracks' };
                    window.openMetadataEditor(track);

                    const titleInput = document.getElementById('metaEditTitle');
                    titleInput.value = 'Hey Daddy (Cachy Studio Master)';

                    // Click save button
                    const saveBtn = document.getElementById('metaEditSaveBtn');
                    await window.saveMetadata();

                    const modal = document.getElementById('metadataEditorModal');
                    const deckTitle = document.getElementById('trackName');

                    return {
                        success: true,
                        modalDisplay: modal.style.display,
                        trackTitle: track.title,
                        deckTitle: deckTitle ? deckTitle.textContent : ''
                    };
                } catch (e) {
                    return { err: e.message, stack: e.stack };
                }
            })()`,
            awaitPromise: true,
            returnByValue: true
        });

        console.log('Save execution result:', result.result.value);

        // Take a screenshot of the state
        const shot = await send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(ARTIFACTS_DIR, 'desktop_metadata_saved.png'), Buffer.from(shot.data, 'base64'));
        console.log('Saved screenshot: desktop_metadata_saved.png');

        ws.close();
    } finally {
        braveProc.kill();
    }
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
