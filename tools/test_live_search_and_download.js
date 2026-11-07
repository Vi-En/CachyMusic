const fs = require('fs');

async function testLiveSearchAndDownload() {
    const resp = await fetch('http://127.0.0.1:9227/json');
    const pages = await resp.json();
    console.log('Connected to Android WebView Page:', pages[0].title);

    const ws = new WebSocket(pages[0].webSocketDebuggerUrl);
    let msgId = 1;
    const send = (method, params = {}) => new Promise((resolve, reject) => {
        const id = msgId++;
        const timeout = setTimeout(() => reject(new Error(`Timeout: ${method}`)), 20000);
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

    // 1. Close settings modal and update UI
    await send('Runtime.evaluate', {
        expression: `(() => {
            const modal = document.getElementById('slskAccountModal');
            if (modal) modal.style.display = 'none';
            if (window.soulseekController) {
                window.soulseekController.checkStatus();
            }
            return true;
        })()`,
        returnByValue: true
    });
    await new Promise(r => setTimeout(r, 800));

    // 2. Check UI Status indicators
    const uiStatus = await send('Runtime.evaluate', {
        expression: `(() => {
            const statusText = document.getElementById('slskStatusText');
            const statusDot = document.querySelector('.slskStatusDot');
            const wsBadge = document.getElementById('wsSoulseekBadge');
            const notice = document.getElementById('slskWorkspaceNotice');

            return {
                statusText: statusText ? statusText.textContent : null,
                statusDotClass: statusDot ? statusDot.className : null,
                wsBadgeClass: wsBadge ? wsBadge.className : null,
                noticeDisplay: notice ? window.getComputedStyle(notice).display : null
            };
        })()`,
        returnByValue: true
    });
    console.log('UI Online Status:', JSON.stringify(uiStatus.result.value, null, 2));

    // 3. Trigger search via soulseekController
    console.log('Triggering search for "Radiohead" via soulseekController.search()...');
    const searchRes = await send('Runtime.evaluate', {
        expression: `(async () => {
            const input = document.getElementById('slskSearchInput');
            if (input) input.value = 'Radiohead';
            if (window.soulseekController) {
                await window.soulseekController.search('Radiohead');
                return {
                    activeToken: window.soulseekController.activeToken,
                    activeQuery: window.soulseekController.activeQuery,
                    isSearching: window.soulseekController.isSearching
                };
            }
            return null;
        })()`,
        awaitPromise: true,
        returnByValue: true
    });
    console.log('Search initiated:', JSON.stringify(searchRes.result.value, null, 2));

    // Take screenshot during active searching animation
    await new Promise(r => setTimeout(r, 600));
    const searchShot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('/home/lien/.gemini/antigravity/brain/8ef29818-f6ab-4782-82fa-f162ed09e52c/android_standalone_search_radar.png', Buffer.from(searchShot.data, 'base64'));
    console.log('Saved screenshot: android_standalone_search_radar.png');

    // 4. Poll results for up to 8 seconds
    let totalItems = 0;
    for (let i = 0; i < 8; i++) {
        await new Promise(r => setTimeout(r, 1000));
        const check = await send('Runtime.evaluate', {
            expression: `(() => {
                const results = window.soulseekController ? window.soulseekController.rawResults : [];
                return {
                    count: results ? results.length : 0,
                    sample: results && results.length > 0 ? {
                        user: results[0].username,
                        file: results[0].filename,
                        sizeFormatted: results[0].sizeFormatted,
                        speedFormatted: results[0].speedFormatted
                    } : null
                };
            })()`,
            returnByValue: true
        });
        totalItems = check.result.value.count;
        console.log(`Poll ${i + 1}s: Received ${totalItems} search results...`);
        if (totalItems > 0) {
            console.log('Sample item:', check.result.value.sample);
            break;
        }
    }

    // 5. Capture results screenshot
    const resultsShot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('/home/lien/.gemini/antigravity/brain/8ef29818-f6ab-4782-82fa-f162ed09e52c/android_standalone_search_results.png', Buffer.from(resultsShot.data, 'base64'));
    console.log('Saved screenshot: android_standalone_search_results.png');

    // 6. Test Download
    console.log('Testing enqueue download...');
    const dlRes = await send('Runtime.evaluate', {
        expression: `(async () => {
            const res = await fetch('php/api/soulseek.php?action=download', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: 'test_peer',
                    virtual_path: 'Music\\\\Radiohead\\\\Creep.mp3',
                    filename: 'Creep.mp3',
                    size: 7850000
                })
            });
            return await res.json();
        })()`,
        awaitPromise: true,
        returnByValue: true
    });
    console.log('Download enqueue result:', JSON.stringify(dlRes.result.value, null, 2));

    // 7. Check transfers
    const transfers = await send('Runtime.evaluate', {
        expression: `(async () => {
            const res = await fetch('php/api/soulseek.php?action=transfers');
            return await res.json();
        })()`,
        awaitPromise: true,
        returnByValue: true
    });
    console.log('Transfers list:', JSON.stringify(transfers.result.value, null, 2));

    // 8. Open transfers drawer and capture screenshot
    await send('Runtime.evaluate', {
        expression: `(() => {
            const drawer = document.getElementById('slskTransfersDrawer');
            if (drawer) drawer.classList.add('open');
        })()`,
        returnByValue: true
    });
    await new Promise(r => setTimeout(r, 600));

    const dlShot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('/home/lien/.gemini/antigravity/brain/8ef29818-f6ab-4782-82fa-f162ed09e52c/android_standalone_transfers_drawer.png', Buffer.from(dlShot.data, 'base64'));
    console.log('Saved screenshot: android_standalone_transfers_drawer.png');

    ws.close();
}

testLiveSearchAndDownload().catch(e => console.error('Error:', e));
