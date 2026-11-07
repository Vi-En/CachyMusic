const fs = require('fs');

async function inspectOtherScreens() {
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

    // 1. Inspect PLAYER tab
    await send('Runtime.evaluate', {
        expression: `(() => {
            document.querySelectorAll('.modalBackdrop, .slskModalOverlay').forEach(m => m.style.display = 'none');
            const b = document.getElementById("mobilePlayerTabBtn");
            if (b) b.click();
        })()`
    });
    await new Promise(r => setTimeout(r, 600));

    const playerReport = await send('Runtime.evaluate', {
        expression: `(() => {
            const deck = document.getElementById('playerDeck');
            const platter = document.querySelector('.turntableContainer, .platterContainer');
            const trackInfo = document.querySelector('.playerTrackInfo, .nowPlayingInfo, .playerDeckTrackInfo');
            const eqBtn = document.getElementById('playerPeqBtn');
            const metrics = document.querySelector('.audioMetricsBar, .audioProcessingBar');

            function box(el) {
                if (!el) return null;
                const r = el.getBoundingClientRect();
                return { width: Math.round(r.width), height: Math.round(r.height), right: Math.round(r.right), bottom: Math.round(r.bottom) };
            }

            return {
                window: { w: window.innerWidth, h: window.innerHeight },
                deck: box(deck),
                platter: box(platter),
                trackInfo: box(trackInfo),
                eqBtn: box(eqBtn),
                metrics: box(metrics)
            };
        })()`,
        returnByValue: true
    });
    console.log('Player Tab Inspection:', JSON.stringify(playerReport.result.value, null, 2));

    // 2. Inspect SETTINGS tab
    await send('Runtime.evaluate', {
        expression: `(() => {
            const b = document.getElementById("mobileSettingsTabBtn");
            if (b) b.click();
        })()`
    });
    await new Promise(r => setTimeout(r, 600));

    const settingsReport = await send('Runtime.evaluate', {
        expression: `(() => {
            const ws = document.getElementById('settingsWorkspace');
            const nav = document.querySelector('.settingsCategoryNav');
            const grid = document.querySelector('.settingsLayoutGrid');
            const cards = document.querySelectorAll('.settingsWorkspaceCard');
            const overflows = [];
            if (ws) {
                ws.querySelectorAll('*').forEach(el => {
                    if (el.scrollWidth > el.clientWidth + 2) {
                        overflows.push({ id: el.id, className: el.className, tag: el.tagName, sw: el.scrollWidth, cw: el.clientWidth });
                    }
                });
            }
            return {
                cardsCount: cards.length,
                overflowsCount: overflows.length,
                overflows: overflows.slice(0, 10)
            };
        })()`,
        returnByValue: true
    });
    console.log('Settings Tab Inspection:', JSON.stringify(settingsReport.result.value, null, 2));

    ws.close();
}

inspectOtherScreens().catch(console.error);
