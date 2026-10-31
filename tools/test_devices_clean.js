const { spawn } = require('child_process');

const devices = [
    { name: 'infinix_note_30_5g', w: 392, h: 872 },
    { name: 'infinix_note_30', w: 392, h: 872 },
    { name: 'infinix_note_50', w: 392, h: 872 },
    { name: 'samsung_galaxy_note', w: 412, h: 915 },
    { name: 'iphone_11', w: 414, h: 896 },
    { name: 'iphone_15', w: 393, h: 852 },
    { name: 'iphone_6', w: 375, h: 667 }
];

const tabs = ['player', 'tracks', 'info', 'soulseek', 'settings', 'download'];

async function run() {
    const proc = spawn('brave', ['--headless', '--disable-gpu', '--no-sandbox', '--remote-debugging-port=9222', '--user-data-dir=/tmp/brave_test', 'about:blank']);
    await new Promise(r => setTimeout(r, 1000));
    const resp = await fetch('http://127.0.0.1:9222/json');
    const list = await resp.json();
    const ws = new WebSocket(list[0].webSocketDebuggerUrl);
    let msgId = 1;
    const send = (method, params = {}) => new Promise(res => {
        const id = msgId++;
        const handler = e => {
            const data = JSON.parse(e.data);
            if (data.id === id) { ws.removeEventListener('message', handler); res(data.result); }
        };
        ws.addEventListener('message', handler);
        ws.send(JSON.stringify({ id, method, params }));
    });
    await new Promise(r => ws.onopen = r);

    let allPass = true;
    for (const dev of devices) {
        await send('Emulation.setDeviceMetricsOverride', { width: dev.w, height: dev.h, deviceScaleFactor: 2, mobile: true });
        
        for (const tab of tabs) {
            await send('Page.navigate', { url: `http://127.0.0.1:8000/index.html` });
            await new Promise(r => setTimeout(r, 300));

            const res = await send('Runtime.evaluate', {
                expression: `(() => {
                    // Switch tab
                    if ('${tab}' === 'tracks') {
                        const b = document.getElementById('tabTracksBtn');
                        if (b) b.click();
                    } else if ('${tab}' === 'info') {
                        const b = document.getElementById('tabInfoBtn');
                        if (b) b.click();
                    } else if ('${tab}' === 'soulseek') {
                        const b = document.getElementById('tabSeekBtn') || document.getElementById('tabSoulseekBtn');
                        if (b) b.click();
                    } else if ('${tab}' === 'settings') {
                        const b = document.getElementById('tabSettingsBtn');
                        if (b) b.click();
                    } else if ('${tab}' === 'download') {
                        const b = document.getElementById('tabDownloadBtn');
                        if (b) b.click();
                    }

                    const docW = document.documentElement.scrollWidth;
                    const bodyW = document.body.scrollWidth;
                    const innerW = window.innerWidth;
                    const ok = (docW <= innerW) && (bodyW <= innerW);
                    return { ok, docW, bodyW, innerW };
                })()`,
                returnByValue: true
            });
            const v = res.result.value;
            if (!v.ok) {
                allPass = false;
                console.log(`[FAIL] ${dev.name} (${dev.w}x${dev.h}) Tab: ${tab} docW=${v.docW} bodyW=${v.bodyW} innerW=${v.innerW}`);
            } else {
                console.log(`[PASS] ${dev.name} Tab: ${tab} (body=${v.bodyW} / inner=${v.innerW})`);
            }
        }
    }

    console.log('\n========================================');
    console.log('ALL DEVICES & TABS TEST RESULT:', allPass ? '100% PASS' : 'SOME FAILED');
    console.log('========================================');

    ws.close();
    proc.kill();
}
run().catch(console.error);
