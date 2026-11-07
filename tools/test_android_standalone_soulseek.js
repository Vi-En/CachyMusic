const fs = require('fs');

async function testStandaloneSoulseek() {
    const resp = await fetch('http://127.0.0.1:9227/json');
    const pages = await resp.json();
    console.log('Connected to Android WebView Page:', pages[0].title, pages[0].url);

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

    // 1. Test AndroidBridge and native SoulseekClient status
    const bridgeStatus = await send('Runtime.evaluate', {
        expression: `(() => {
            const hasBridge = typeof window.AndroidBridge !== 'undefined';
            const isAndroid = hasBridge && window.AndroidBridge.isAndroid();
            let rawStatus = null;
            if (hasBridge && window.AndroidBridge.callSoulseekApi) {
                rawStatus = window.AndroidBridge.callSoulseekApi('status', '{}', '');
            }
            return {
                hasBridge,
                isAndroid,
                nativeStatus: rawStatus ? JSON.parse(rawStatus) : null
            };
        })()`,
        returnByValue: true
    });
    console.log('Native Bridge Status:', JSON.stringify(bridgeStatus.result.value, null, 2));

    // 2. Test fetch('php/api/soulseek.php?action=status') via the overridden fetch hook
    const fetchStatus = await send('Runtime.evaluate', {
        expression: `(async () => {
            try {
                const res = await fetch('php/api/soulseek.php?action=status');
                const data = await res.json();
                return { ok: true, data };
            } catch (err) {
                return { ok: false, error: err.message };
            }
        })()`,
        awaitPromise: true,
        returnByValue: true
    });
    console.log('Fetch Status:', JSON.stringify(fetchStatus.result.value, null, 2));

    // 3. Switch to Soulseek tab
    await send('Runtime.evaluate', {
        expression: `(() => {
            const tab = document.querySelector('.mobileTabBar .tabBtn[data-workspace="soulseek"]');
            if (tab) tab.click();
            return !!tab;
        })()`,
        returnByValue: true
    });
    await new Promise(r => setTimeout(r, 600));

    // 4. Open Soulseek Settings Modal
    await send('Runtime.evaluate', {
        expression: `(() => {
            const btn = document.getElementById('slskNoticeActionBtn') || document.getElementById('slskAccountBtn');
            if (btn) btn.click();
            return !!btn;
        })()`,
        returnByValue: true
    });
    await new Promise(r => setTimeout(r, 600));

    // 5. Inspect Settings Modal fields on Android
    const modalInspection = await send('Runtime.evaluate', {
        expression: `(() => {
            const modal = document.getElementById('slskAccountModal');
            const hostGroup = document.getElementById('slskModalHostGroup');
            const userIn = document.getElementById('slskModalUsername');
            const passIn = document.getElementById('slskModalPassword');
            const dirIn = document.getElementById('slskModalDownloadDir');
            const noticeTitle = document.getElementById('slskNoticeTitle');
            const noticeMsg = document.getElementById('slskNoticeMsg');

            return {
                modalDisplay: modal ? window.getComputedStyle(modal).display : null,
                hostGroupDisplay: hostGroup ? window.getComputedStyle(hostGroup).display : null,
                hasUsernameField: !!userIn,
                hasPasswordField: !!passIn,
                hasDownloadDirField: !!dirIn,
                downloadDirValue: dirIn ? dirIn.value : null,
                noticeTitle: noticeTitle ? noticeTitle.textContent : null,
                noticeMsg: noticeMsg ? noticeMsg.textContent : null
            };
        })()`,
        returnByValue: true
    });
    console.log('Modal & UI Inspection:', JSON.stringify(modalInspection.result.value, null, 2));

    // 6. Test Login via the modal with test/live credentials
    console.log('Testing native login dispatch...');
    const loginTest = await send('Runtime.evaluate', {
        expression: `(async () => {
            try {
                // Test login with a test username
                const res = await fetch('php/api/soulseek.php?action=login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        username: 'cachy_tester_' + Math.floor(Math.random() * 9000 + 1000),
                        password: 'testpassword123'
                    })
                });
                return await res.json();
            } catch (e) {
                return { error: e.message };
            }
        })()`,
        awaitPromise: true,
        returnByValue: true
    });
    console.log('Login Test Result:', JSON.stringify(loginTest.result.value, null, 2));

    // 7. Check status after login attempt
    const statusAfter = await send('Runtime.evaluate', {
        expression: `(async () => {
            const res = await fetch('php/api/soulseek.php?action=status');
            return await res.json();
        })()`,
        awaitPromise: true,
        returnByValue: true
    });
    console.log('Status After Login:', JSON.stringify(statusAfter.result.value, null, 2));

    // 8. Test Search
    console.log('Testing standalone search broadcast...');
    const searchTest = await send('Runtime.evaluate', {
        expression: `(async () => {
            const res = await fetch('php/api/soulseek.php?action=search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: 'FLAC' })
            });
            return await res.json();
        })()`,
        awaitPromise: true,
        returnByValue: true
    });
    console.log('Search Test Result:', JSON.stringify(searchTest.result.value, null, 2));

    // Wait 3 seconds for peer search responses
    await new Promise(r => setTimeout(r, 3000));

    // 9. Check results
    if (searchTest.result.value && searchTest.result.value.token) {
        const resultsTest = await send('Runtime.evaluate', {
            expression: `(async () => {
                const res = await fetch('php/api/soulseek.php?action=results&token=${searchTest.result.value.token}&limit=10');
                return await res.json();
            })()`,
            awaitPromise: true,
            returnByValue: true
        });
        console.log('Results Test Output (summary):', {
            ok: resultsTest.result.value.ok,
            token: resultsTest.result.value.token,
            total: resultsTest.result.value.total,
            count: resultsTest.result.value.count,
            firstItem: resultsTest.result.value.items && resultsTest.result.value.items.length > 0
                ? {
                    username: resultsTest.result.value.items[0].username,
                    filename: resultsTest.result.value.items[0].filename,
                    sizeFormatted: resultsTest.result.value.items[0].sizeFormatted
                }
                : 'No items yet'
        });
    }

    // 10. Capture screenshot from Android emulator
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('/home/lien/.gemini/antigravity/brain/8ef29818-f6ab-4782-82fa-f162ed09e52c/android_standalone_soulseek_verified.png', Buffer.from(shot.data, 'base64'));
    console.log('Saved screenshot: android_standalone_soulseek_verified.png');

    ws.close();
}

testStandaloneSoulseek().catch(e => console.error('Error:', e));
