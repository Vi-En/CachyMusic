const fs = require('fs');

async function auditMobileLayouts() {
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

    // Close any open modals first
    await send('Runtime.evaluate', {
        expression: `(() => {
            document.querySelectorAll('.modalBackdrop, .slskModalOverlay').forEach(m => m.style.display = 'none');
            const drawer = document.getElementById('slskTransfersDrawer');
            if (drawer) drawer.classList.remove('open');
        })()`
    });

    const tabs = [
        { id: 'mobilePlayerTabBtn', target: 'playerDeck', name: 'PLAYER' },
        { id: 'mobileTracksTabBtn', target: 'trackListPanel', name: 'TRACKS' },
        { id: 'mobileInfoTabBtn', target: 'settingsPanel', name: 'INFO' },
        { id: 'mobileSoulseekTabBtn', target: 'soulseekWorkspace', name: 'SEEK' },
        { id: 'mobileSettingsTabBtn', target: 'settingsWorkspace', name: 'SETTINGS' }
    ];

    const results = {};

    for (const tab of tabs) {
        await send('Runtime.evaluate', {
            expression: `(() => {
                const b = document.getElementById("${tab.id}");
                if (b) b.click();
            })()`
        });
        await new Promise(r => setTimeout(r, 600));

        const tabAudit = await send('Runtime.evaluate', {
            expression: `(() => {
                const winWidth = window.innerWidth;
                const overflows = [];
                document.querySelectorAll("body, main, section, div, form, nav, header, ul, table").forEach(el => {
                    // Only check visible elements
                    if (el.offsetParent === null && window.getComputedStyle(el).display === 'none') return;
                    const r = el.getBoundingClientRect();
                    if (r.width > winWidth + 2 || r.right > winWidth + 2) {
                        overflows.push({
                            tag: el.tagName,
                            id: el.id,
                            className: el.className,
                            right: Math.round(r.right),
                            width: Math.round(r.width),
                            scrollWidth: el.scrollWidth,
                            clientWidth: el.clientWidth
                        });
                    }
                });
                return {
                    winWidth,
                    overflowsCount: overflows.length,
                    overflows: overflows.slice(0, 10)
                };
            })()`,
            returnByValue: true
        });

        results[tab.name] = tabAudit.result.value;

        // Screenshot
        const shot = await send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(`/home/lien/.gemini/antigravity/brain/8ef29818-f6ab-4782-82fa-f162ed09e52c/audit_tab_${tab.name.toLowerCase()}.png`, Buffer.from(shot.data, 'base64'));
    }

    // Now test PEQ Equalizer Modal
    await send('Runtime.evaluate', {
        expression: `(() => {
            const btn = document.getElementById("mobilePlayerTabBtn");
            if (b = btn) b.click();
            const peqBtn = document.getElementById("playerPeqBtn");
            if (peqBtn) peqBtn.click();
        })()`
    });
    await new Promise(r => setTimeout(r, 800));

    const peqAudit = await send('Runtime.evaluate', {
        expression: `(() => {
            const winWidth = window.innerWidth;
            const card = document.querySelector(".peqModalCard");
            const overflows = [];
            if (card) {
                card.querySelectorAll("*").forEach(el => {
                    const r = el.getBoundingClientRect();
                    if (r.width > winWidth + 2 || r.right > winWidth + 2 || el.scrollWidth > el.clientWidth + 2) {
                        overflows.push({
                            tag: el.tagName,
                            id: el.id,
                            className: el.className,
                            right: Math.round(r.right),
                            width: Math.round(r.width),
                            scrollWidth: el.scrollWidth,
                            clientWidth: el.clientWidth
                        });
                    }
                });
            }
            return {
                cardRect: card ? card.getBoundingClientRect() : null,
                cardScroll: card ? { scrollWidth: card.scrollWidth, clientWidth: card.clientWidth, scrollHeight: card.scrollHeight, clientHeight: card.clientHeight } : null,
                overflowsCount: overflows.length,
                overflows
            };
        })()`,
        returnByValue: true
    });
    results['PEQ_MODAL'] = peqAudit.result.value;

    const peqShot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('/home/lien/.gemini/antigravity/brain/8ef29818-f6ab-4782-82fa-f162ed09e52c/audit_peq_modal.png', Buffer.from(peqShot.data, 'base64'));

    console.log('AUDIT RESULTS:\n', JSON.stringify(results, null, 2));
    ws.close();
}

auditMobileLayouts().catch(console.error);
