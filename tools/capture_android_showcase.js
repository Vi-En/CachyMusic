const fs = require('fs');
const { execSync } = require('child_process');

const ARTIFACT_DIR = '/home/lien/.gemini/antigravity/brain/8ef29818-f6ab-4782-82fa-f162ed09e52c';

async function showcase() {
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

    // View 1: Open Soulseek Settings Modal on Android
    console.log('[1/3] Opening Soulseek Settings Modal on Android...');
    await send('Runtime.evaluate', {
        expression: `(() => {
            const slskTab = document.getElementById('mobileSoulseekTabBtn');
            if (slskTab) slskTab.click();
            const btn = document.getElementById('slskAccountBtn') || document.getElementById('slskNoticeActionBtn');
            if (btn) btn.click();
        })()`
    });
    await new Promise(r => setTimeout(r, 600));
    execSync(`adb exec-out screencap -p > "${ARTIFACT_DIR}/android_emulator_slsk_modal.png"`);

    // View 2: Close modal and view Soulseek Workspace
    console.log('[2/3] Capturing Soulseek Workspace on Android...');
    await send('Runtime.evaluate', {
        expression: `(() => {
            const closeBtn = document.getElementById('slskCloseAccountModalBtn');
            if (closeBtn) closeBtn.click();
        })()`
    });
    await new Promise(r => setTimeout(r, 400));
    execSync(`adb exec-out screencap -p > "${ARTIFACT_DIR}/android_emulator_slsk_workspace.png"`);

    // View 3: Open Player Deck & Studio Equalizer on Android
    console.log('[3/3] Capturing Studio Equalizer Workstation on Android...');
    await send('Runtime.evaluate', {
        expression: `(() => {
            const playerTab = document.getElementById('mobilePlayerTabBtn');
            if (playerTab) playerTab.click();
            const peqBtn = document.getElementById('playerPeqBtn');
            if (peqBtn) peqBtn.click();
        })()`
    });
    await new Promise(r => setTimeout(r, 600));
    execSync(`adb exec-out screencap -p > "${ARTIFACT_DIR}/android_emulator_equalizer.png"`);

    console.log('✓ All Android emulator showcase views captured successfully!');
    ws.close();
}

showcase().catch(e => {
    console.error('Showcase error:', e);
    process.exit(1);
});
