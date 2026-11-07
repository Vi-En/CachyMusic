const fs = require('fs');

async function captureArtifactScreenshots() {
    const resp = await fetch('http://127.0.0.1:9227/json');
    const pages = await resp.json();
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

    // 1. Close transfers drawer and modals, stay on Soulseek workspace
    await send('Runtime.evaluate', {
        expression: `(() => {
            const drawer = document.getElementById('slskTransfersDrawer');
            if (drawer) drawer.classList.remove('open');
            const modal = document.getElementById('slskAccountModal');
            if (modal) modal.style.display = 'none';
            const tab = document.querySelector('.mobileTabBar .tabBtn[data-workspace="soulseek"]');
            if (tab) tab.click();
        })()`
    });
    await new Promise(r => setTimeout(r, 600));

    const shot1 = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('/home/lien/.gemini/antigravity/brain/8ef29818-f6ab-4782-82fa-f162ed09e52c/android_standalone_workspace_main.png', Buffer.from(shot1.data, 'base64'));
    console.log('Saved android_standalone_workspace_main.png');

    // 2. Open Settings Modal (clean standalone layout with no workstation host group)
    await send('Runtime.evaluate', {
        expression: `(() => {
            const btn = document.getElementById('slskAccountBtn') || document.getElementById('slskNoticeActionBtn');
            if (btn) btn.click();
        })()`
    });
    await new Promise(r => setTimeout(r, 600));

    const shot2 = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('/home/lien/.gemini/antigravity/brain/8ef29818-f6ab-4782-82fa-f162ed09e52c/android_standalone_settings_modal.png', Buffer.from(shot2.data, 'base64'));
    console.log('Saved android_standalone_settings_modal.png');

    // 3. Close settings modal and switch to EQ tab
    await send('Runtime.evaluate', {
        expression: `(() => {
            const modal = document.getElementById('slskAccountModal');
            if (modal) modal.style.display = 'none';
            const eqTab = document.querySelector('.mobileTabBar .tabBtn[data-workspace="equalizer"]');
            if (eqTab) eqTab.click();
        })()`
    });
    await new Promise(r => setTimeout(r, 600));

    const shot3 = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('/home/lien/.gemini/antigravity/brain/8ef29818-f6ab-4782-82fa-f162ed09e52c/android_standalone_eq_verified.png', Buffer.from(shot3.data, 'base64'));
    console.log('Saved android_standalone_eq_verified.png');

    ws.close();
}

captureArtifactScreenshots().catch(console.error);
