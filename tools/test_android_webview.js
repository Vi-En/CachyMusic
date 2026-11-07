const fs = require('fs');

async function testWebView() {
    const resp = await fetch('http://127.0.0.1:9227/json');
    const pages = await resp.json();
    console.log('Connected to Android WebView Page:', pages[0].title, pages[0].url);

    const ws = new WebSocket(pages[0].webSocketDebuggerUrl);
    let msgId = 1;
    const send = (method, params = {}) => new Promise((resolve, reject) => {
        const id = msgId++;
        const timeout = setTimeout(() => reject(new Error(`Timeout: ${method}`)), 10000);
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

    // 1. Inspect current state
    const state = await send('Runtime.evaluate', {
        expression: `(() => {
            const notice = document.getElementById('slskWorkspaceNotice');
            const noticeBtn = document.getElementById('slskNoticeActionBtn');
            const modal = document.getElementById('slskAccountModal');
            return {
                noticeVisible: notice ? notice.style.display : null,
                noticeBtnExists: !!noticeBtn,
                modalDisplay: modal ? modal.style.display : null
            };
        })()`,
        returnByValue: true
    });
    console.log('State before clicking SETTINGS:', state.result.value);

    // 2. Click Settings button in Soulseek notice banner
    const clickRes = await send('Runtime.evaluate', {
        expression: `(() => {
            const btn = document.getElementById('slskNoticeActionBtn');
            if (btn) {
                btn.click();
                return 'Clicked slskNoticeActionBtn';
            }
            return 'Button not found';
        })()`,
        returnByValue: true
    });
    console.log('Click result:', clickRes.result.value);

    await new Promise(r => setTimeout(r, 600));

    // 3. Inspect modal state after click
    const modalState = await send('Runtime.evaluate', {
        expression: `(() => {
            const modal = document.getElementById('slskAccountModal');
            const card = modal?.querySelector('.slskModalCard');
            const hostInput = document.getElementById('slskModalHost');
            const autoDetectBtn = document.getElementById('slskModalAutoDetectHostBtn');
            const usernameInput = document.getElementById('slskModalUsername');
            const closeBtn = document.getElementById('slskCloseAccountModalBtn');
            const alertBox = document.getElementById('slskAccountAlert');

            return {
                modalDisplay: modal ? window.getComputedStyle(modal).display : null,
                modalZIndex: modal ? window.getComputedStyle(modal).zIndex : null,
                cardMaxHeight: card ? window.getComputedStyle(card).maxHeight : null,
                hostInputExists: !!hostInput,
                hostInputValue: hostInput ? hostInput.value : null,
                autoDetectBtnExists: !!autoDetectBtn,
                usernameInputExists: !!usernameInput,
                closeBtnExists: !!closeBtn,
                alertDisplay: alertBox ? alertBox.style.display : null
            };
        })()`,
        returnByValue: true
    });
    console.log('Modal state after opening:', modalState.result.value);

    // 4. Test Auto-Detect / Setting Host
    const setHostRes = await send('Runtime.evaluate', {
        expression: `(() => {
            const hostInput = document.getElementById('slskModalHost');
            if (hostInput) {
                // In Android emulator, 10.0.2.2 is the special alias to the host loopback interface (127.0.0.1 on host PC)
                hostInput.value = 'http://10.0.2.2:8000';
            }
            const saveBtn = document.getElementById('slskSaveAccountBtn');
            if (saveBtn) {
                saveBtn.click();
                return 'Clicked Save & Connect with 10.0.2.2 host';
            }
            return 'Save button not found';
        })()`,
        returnByValue: true
    });
    console.log('Set host result:', setHostRes.result.value);

    await new Promise(r => setTimeout(r, 1200));

    // 5. Inspect status after connect
    const afterConnect = await send('Runtime.evaluate', {
        expression: `(() => {
            const alertBox = document.getElementById('slskAccountAlert');
            const modal = document.getElementById('slskAccountModal');
            return {
                modalDisplay: modal ? modal.style.display : null,
                alertVisible: alertBox ? alertBox.style.display : null,
                alertText: alertBox ? alertBox.textContent.trim().replace(/\\s+/g, ' ') : null,
                savedHostStorage: safeStorage.getItem('cachymusic_slsk_host')
            };
        })()`,
        returnByValue: true
    });
    console.log('After connect evaluation:', afterConnect.result.value);

    // 6. Test Close Button (✕)
    const closeTest = await send('Runtime.evaluate', {
        expression: `(() => {
            const closeBtn = document.getElementById('slskCloseAccountModalBtn');
            if (closeBtn) closeBtn.click();
            const modal = document.getElementById('slskAccountModal');
            return {
                modalDisplayAfterClose: modal ? modal.style.display : null
            };
        })()`,
        returnByValue: true
    });
    console.log('Close button result:', closeTest.result.value);

    ws.close();
}

testWebView().catch(e => {
    console.error('WebView Test Error:', e);
    process.exit(1);
});
