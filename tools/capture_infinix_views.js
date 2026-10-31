const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const outDir = '/home/lien/.gemini/antigravity/brain/8ef29818-f6ab-4782-82fa-f162ed09e52c/screenshots';
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

async function capture() {
    const proc = spawn('brave', ['--headless', '--disable-gpu', '--no-sandbox', '--remote-debugging-port=9223', '--user-data-dir=/tmp/brave_cap', 'about:blank']);
    await new Promise(r => setTimeout(r, 1200));
    const resp = await fetch('http://127.0.0.1:9223/json');
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

    // Infinix Note 30 5G viewport
    await send('Emulation.setDeviceMetricsOverride', { width: 392, height: 872, deviceScaleFactor: 2.75, mobile: true });

    const views = [
        { name: 'infinix_settings_fixed', tab: 'settings' },
        { name: 'infinix_soulseek_fixed', tab: 'soulseek' },
        { name: 'infinix_player_fixed', tab: 'player' }
    ];

    for (const v of views) {
        await send('Page.navigate', { url: 'http://127.0.0.1:8000/index.html' });
        await new Promise(r => setTimeout(r, 600));

        await send('Runtime.evaluate', {
            expression: `(() => {
                if ('${v.tab}' === 'settings') {
                    const b = document.getElementById('mobileSettingsTabBtn');
                    if (b) b.click();
                    // simulate mini player active
                    const mini = document.getElementById('persistentMiniPlayer');
                    if (mini) mini.style.setProperty('display', 'flex', 'important');
                } else if ('${v.tab}' === 'soulseek') {
                    const b = document.getElementById('mobileSoulseekTabBtn');
                    if (b) b.click();
                    const mini = document.getElementById('persistentMiniPlayer');
                    if (mini) mini.style.setProperty('display', 'flex', 'important');
                } else if ('${v.tab}' === 'player') {
                    const b = document.getElementById('mobilePlayerTabBtn');
                    if (b) b.click();
                }
            })()`
        });

        await new Promise(r => setTimeout(r, 800));

        const shot = await send('Page.captureScreenshot', { format: 'png' });
        const filePath = path.join(outDir, `${v.name}.png`);
        fs.writeFileSync(filePath, Buffer.from(shot.data, 'base64'));
        console.log(`Captured ${filePath}`);
    }

    proc.kill('SIGKILL');
}

capture().catch(err => {
    console.error(err);
    process.exit(1);
});
