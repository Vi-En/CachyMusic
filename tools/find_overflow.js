const { spawn } = require('child_process');

async function test() {
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
    await send('Emulation.setDeviceMetricsOverride', { width: 392, height: 872, deviceScaleFactor: 2, mobile: true });
    await send('Page.navigate', { url: 'http://127.0.0.1:8000/index.html' });
    await new Promise(r => setTimeout(r, 1000));

    const check = await send('Runtime.evaluate', {
        expression: `(() => {
            const wide = [];
            document.querySelectorAll('*').forEach(el => {
                const r = el.getBoundingClientRect();
                if ((r.right > window.innerWidth + 5 || el.scrollWidth > window.innerWidth + 5) && el.offsetWidth > 0 && el.offsetHeight > 0) {
                    wide.push({ tag: el.tagName, id: el.id, cls: typeof el.className === 'string' ? el.className : '', w: el.scrollWidth, right: Math.round(r.right) });
                }
            });
            return wide;
        })()`,
        returnByValue: true
    });
    console.log('Offending wide elements:', JSON.stringify(check.result.value, null, 2));
    ws.close();
    proc.kill();
}
test().catch(console.error);
