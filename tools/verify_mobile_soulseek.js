const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const ARTIFACT_DIR = '/home/lien/.gemini/antigravity/brain/8ef29818-f6ab-4782-82fa-f162ed09e52c';
if (!fs.existsSync(ARTIFACT_DIR)) fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

async function run() {
    console.log('--- Launching Headless Brave for Mobile & Desktop Verification ---');
    const port = 9225;
    const proc = spawn('/usr/bin/brave', [
        '--headless',
        '--disable-gpu',
        '--no-sandbox',
        `--remote-debugging-port=${port}`,
        '--user-data-dir=/tmp/brave_slsk_verify',
        'about:blank'
    ]);

    proc.on('error', (err) => console.error('Brave spawn error:', err));
    await new Promise(r => setTimeout(r, 1200));

    try {
        const resp = await fetch(`http://127.0.0.1:${port}/json`);
        const list = await resp.json();
        const ws = new WebSocket(list[0].webSocketDebuggerUrl);

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
        await send('Page.enable');
        await send('Runtime.enable');

        // =====================================================================
        // Test 1: Mobile Viewport (390 x 844)
        // =====================================================================
        console.log('\n[1/2] Verifying Mobile Layout (390 x 844)...');
        await send('Emulation.setDeviceMetricsOverride', {
            width: 390,
            height: 844,
            deviceScaleFactor: 3,
            mobile: true
        });

        await send('Page.navigate', { url: 'http://127.0.0.1:8000/index.html' });
        await new Promise(r => setTimeout(r, 1200));

        // Switch to Soulseek tab
        const navRes = await send('Runtime.evaluate', {
            expression: `(() => {
                const slskTabBtn = document.getElementById('mobileSoulseekTabBtn') || document.getElementById('navSoulseekBtn');
                if (slskTabBtn) slskTabBtn.click();
                const ws = document.getElementById('soulseekWorkspace');
                return {
                    workspaceVisible: ws && ws.style.display !== 'none',
                    noticeTitle: document.getElementById('slskNoticeTitle')?.textContent,
                    noticeMsg: document.getElementById('slskNoticeMsg')?.textContent
                };
            })()`,
            returnByValue: true
        });
        console.log('Mobile Soulseek Workspace Status:', navRes.result.value);

        // Capture mobile workspace
        let ss = await send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(ARTIFACT_DIR, 'mobile_slsk_workspace_verified.png'), Buffer.from(ss.data, 'base64'));

        // Open Soulseek Settings Modal
        const openModalRes = await send('Runtime.evaluate', {
            expression: `(() => {
                const btn = document.getElementById('slskAccountBtn') || document.getElementById('slskNoticeActionBtn');
                if (btn) btn.click();
                const modal = document.getElementById('slskAccountModal');
                const hostGroup = document.getElementById('slskModalHostGroup');
                const hostInput = document.getElementById('slskModalHost');
                const autoDetectBtn = document.getElementById('slskModalAutoDetectHostBtn');
                const closeBtn = document.getElementById('slskCloseAccountModalBtn');
                const drawer = document.getElementById('slskTransfersDrawer');
                const card = modal?.querySelector('.slskModalCard');

                return {
                    modalDisplay: modal ? window.getComputedStyle(modal).display : 'none',
                    modalZIndex: modal ? window.getComputedStyle(modal).zIndex : null,
                    hostGroupExists: !!hostGroup,
                    hostInputPlaceholder: hostInput ? hostInput.placeholder : null,
                    autoDetectExists: !!autoDetectBtn,
                    closeBtnExists: !!closeBtn,
                    drawerIsOpen: drawer ? drawer.classList.contains('open') : false,
                    cardMaxHeight: card ? window.getComputedStyle(card).maxHeight : null
                };
            })()`,
            returnByValue: true
        });
        console.log('Mobile Settings Modal State:', openModalRes.result.value);

        await new Promise(r => setTimeout(r, 400));
        ss = await send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(ARTIFACT_DIR, 'mobile_slsk_modal_verified.png'), Buffer.from(ss.data, 'base64'));

        // Test Close Button (✕)
        const closeRes = await send('Runtime.evaluate', {
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
        console.log('Mobile Modal Close Result:', closeRes.result.value);

        await new Promise(r => setTimeout(r, 300));
        ss = await send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(ARTIFACT_DIR, 'mobile_slsk_modal_closed_verified.png'), Buffer.from(ss.data, 'base64'));

        // =====================================================================
        // Test 2: Desktop Viewport (1440 x 900)
        // =====================================================================
        console.log('\n[2/2] Verifying Desktop Layout (1440 x 900)...');
        await send('Emulation.setDeviceMetricsOverride', {
            width: 1440,
            height: 900,
            deviceScaleFactor: 1,
            mobile: false
        });

        await send('Page.navigate', { url: 'http://127.0.0.1:8000/index.html' });
        await new Promise(r => setTimeout(r, 1000));

        // Switch to Soulseek on Desktop
        await send('Runtime.evaluate', {
            expression: `(() => {
                const btn = document.getElementById('navSoulseekBtn');
                if (btn) btn.click();
            })()`
        });
        await new Promise(r => setTimeout(r, 400));
        ss = await send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(ARTIFACT_DIR, 'desktop_slsk_workspace_verified.png'), Buffer.from(ss.data, 'base64'));

        // Open Desktop Settings Modal
        await send('Runtime.evaluate', {
            expression: `(() => {
                const btn = document.getElementById('slskAccountBtn');
                if (btn) btn.click();
            })()`
        });
        await new Promise(r => setTimeout(r, 400));
        ss = await send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(ARTIFACT_DIR, 'desktop_slsk_modal_verified.png'), Buffer.from(ss.data, 'base64'));

        // Open EQ Modal to verify high contrast visuals on desktop
        await send('Runtime.evaluate', {
            expression: `(() => {
                const closeBtn = document.getElementById('slskCloseAccountModalBtn');
                if (closeBtn) closeBtn.click();
                const navPlayer = document.getElementById('navPlayerBtn');
                if (navPlayer) navPlayer.click();
                const peqBtn = document.getElementById('playerPeqBtn');
                if (peqBtn) peqBtn.click();
            })()`
        });
        await new Promise(r => setTimeout(r, 500));
        ss = await send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(ARTIFACT_DIR, 'desktop_peq_contrast_verified.png'), Buffer.from(ss.data, 'base64'));

        console.log('\n✓ All Brave Headless captures and evaluations completed successfully!');
        ws.close();
    } finally {
        proc.kill('SIGKILL');
    }
}

run().catch(err => {
    console.error('Fatal Verification Error:', err);
    process.exit(1);
});
