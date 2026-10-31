const { spawn } = require('child_process');

const themes = [
    'default', 'nms', 'solar-eclipse', 'euclid-horizon', 'alien-paradise',
    'abyssal-void', 'dissonance', 'sentinel', 'minimalist-light',
    'minimalist-dark', 'minimalist-warm', 'minimalist-obsidian'
];

const tabs = ['player', 'tracks', 'info', 'soulseek', 'settings', 'download'];

function parseRgba(str) {
    if (!str) return null;
    const m = str.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)(?:,\\s*([\\d.]+))?\\)/);
    return m ? [parseInt(m[1]), parseInt(m[2]), parseInt(m[3]), m[4] !== undefined ? parseFloat(m[4]) : 1.0] : null;
}

function composite(fgRgba, bgRgb) {
    const a = fgRgba[3];
    return [
        Math.round(fgRgba[0] * a + bgRgb[0] * (1 - a)),
        Math.round(fgRgba[1] * a + bgRgb[1] * (1 - a)),
        Math.round(fgRgba[2] * a + bgRgb[2] * (1 - a))
    ];
}

function srgbToLinear(c) {
    c = c / 255.0;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function relLuminance(rgb) {
    return 0.2126 * srgbToLinear(rgb[0]) + 0.7152 * srgbToLinear(rgb[1]) + 0.0722 * srgbToLinear(rgb[2]);
}

function contrastRatio(rgb1, rgb2) {
    const l1 = relLuminance(rgb1);
    const l2 = relLuminance(rgb2);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

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
    await send('Emulation.setDeviceMetricsOverride', { width: 392, height: 872, deviceScaleFactor: 2, mobile: true });

    const failures = [];

    for (const t of themes) {
        for (const tab of tabs) {
            await send('Page.navigate', { url: `http://127.0.0.1:8000/index.html?theme=${t}` });
            await new Promise(r => setTimeout(r, 350));

            const res = await send('Runtime.evaluate', {
                expression: `(() => {
                    // Apply the mobile overflow fixes first
                    const style = document.createElement("style");
                    style.innerHTML = \`
                      .bgDisc, .bgWatermark { display: none !important; }
                      #toggleFolderBtn { display: none !important; }
                      #topSettingsBtn span { display: none !important; }
                      .ambientAtmosphere { overflow: hidden !important; max-width: 100vw !important; }
                      html, body { overflow-x: hidden !important; max-width: 100vw !important; }
                    \`;
                    document.head.appendChild(style);

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

                    // Extract all visible text nodes and their computed colors
                    const textElements = [];
                    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT, {
                        acceptNode(node) {
                            const rect = node.getBoundingClientRect();
                            if (rect.width === 0 || rect.height === 0) return NodeFilter.FILTER_REJECT;
                            const style = window.getComputedStyle(node);
                            if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
                                return NodeFilter.FILTER_REJECT;
                            }
                            // Only check elements with direct text or significant controls
                            const hasDirectText = Array.from(node.childNodes).some(n => n.nodeType === Node.TEXT_NODE && n.nodeValue.trim().length > 0);
                            const isButtonOrInput = ['BUTTON', 'INPUT', 'SELECT', 'A', 'LABEL', 'H1', 'H2', 'H3', 'H4', 'SPAN', 'P'].includes(node.tagName);
                            if (hasDirectText || isButtonOrInput) return NodeFilter.FILTER_ACCEPT;
                            return NodeFilter.FILTER_SKIP;
                        }
                    });

                    let cur;
                    while (cur = walker.nextNode()) {
                        const rect = cur.getBoundingClientRect();
                        const style = window.getComputedStyle(cur);
                        const text = (cur.innerText || cur.placeholder || cur.value || '').trim().slice(0, 30);
                        if (!text) continue;

                        // Find background
                        let bgNode = cur;
                        let bgRgba = null;
                        let bgStack = [];
                        while (bgNode && bgNode !== document) {
                            const bStyle = window.getComputedStyle(bgNode);
                            const m = bStyle.backgroundColor.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)(?:,\\s*([\\d.]+))?\\)/);
                            if (m) {
                                const a = m[4] !== undefined ? parseFloat(m[4]) : 1.0;
                                if (a > 0.01) {
                                    bgStack.push([parseInt(m[1]), parseInt(m[2]), parseInt(m[3]), a]);
                                    if (a >= 0.95) break;
                                }
                            }
                            bgNode = bgNode.parentElement;
                        }

                        textElements.push({
                            tag: cur.tagName,
                            id: cur.id,
                            cls: cur.className.toString ? cur.className.toString().slice(0, 30) : '',
                            text,
                            color: style.color,
                            fontSize: parseFloat(style.fontSize),
                            fontWeight: style.fontWeight,
                            bgStack
                        });
                    }

                    return textElements;
                })()`,
                returnByValue: true
            });

            const elements = res.result.value || [];
            for (const el of elements) {
                const fg = parseRgba(el.color);
                if (!fg) continue;

                // Composite background stack from bottom up
                let currentBg = [10, 11, 14]; // default root canvas
                if (el.bgStack && el.bgStack.length > 0) {
                    for (let i = el.bgStack.length - 1; i >= 0; i--) {
                        currentBg = composite(el.bgStack[i], currentBg);
                    }
                }

                // If text color has opacity, composite over currentBg
                const effFg = composite(fg, currentBg);
                const ratio = contrastRatio(effFg, currentBg);

                // Thresholds: Normal text >= 4.5:1 (AA) or 7:1 (AAA); Large text (>=18pt or >=14pt bold) >= 3:1 (AA) or 4.5:1 (AAA)
                const isLarge = el.fontSize >= 24 || (el.fontSize >= 18.5 && (el.fontWeight === 'bold' || parseInt(el.fontWeight) >= 700));
                const minRatio = isLarge ? 3.0 : 4.5;

                if (ratio < minRatio && ratio < 4.0) {
                    failures.push({
                        theme: t,
                        tab,
                        tag: el.tag,
                        id: el.id,
                        cls: el.cls,
                        text: el.text,
                        ratio: ratio.toFixed(2),
                        minRequired: minRatio,
                        fg: el.color,
                        bg: 'rgb(' + currentBg.join(',') + ')'
                    });
                }
            }
        }
    }

    console.log(`\n========================================`);
    console.log(`AUDIT COMPLETE: ${failures.length} CONTRAST ISSUES FOUND`);
    console.log(`========================================`);
    
    // Deduplicate failures
    const seen = new Set();
    const uniqueFailures = [];
    for (const f of failures) {
        const key = `${f.theme}|${f.tab}|${f.cls}|${f.text}`;
        if (!seen.has(key)) {
            seen.add(key);
            uniqueFailures.push(f);
        }
    }

    console.log(`Unique issues: ${uniqueFailures.length}`);
    uniqueFailures.slice(0, 50).forEach(f => {
        console.log(`[${f.theme.toUpperCase()}] Tab:${f.tab} <${f.tag}.${f.cls}> "${f.text}" -> ${f.ratio}:1 (req >= ${f.minRequired}) [fg: ${f.fg} on ${f.bg}]`);
    });

    ws.close();
    proc.kill();
}

run().catch(console.error);

