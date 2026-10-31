const { spawn } = require('child_process');
const http = require('http');

const devices = [
    { name: 'infinix_note_30', w: 392, h: 872 },
    { name: 'samsung_galaxy_note', w: 412, h: 915 },
    { name: 'iphone_11', w: 414, h: 896 },
    { name: 'iphone_15', w: 393, h: 852 },
    { name: 'iphone_6', w: 375, h: 667 }
];

const themes = [
    'default', 'nms', 'solar-eclipse', 'euclid-horizon', 'alien-paradise',
    'abyssal-void', 'dissonance', 'sentinel', 'minimalist-light',
    'minimalist-dark', 'minimalist-warm', 'minimalist-obsidian'
];

async function runAudit() {
    const proc = spawn('brave', [
        '--headless', '--disable-gpu', '--no-sandbox',
        '--remote-debugging-port=9222',
        '--user-data-dir=/tmp/brave_audit',
        'about:blank'
    ]);

    await new Promise(r => setTimeout(r, 1200));

    try {
        const resp = await fetch('http://127.0.0.1:9222/json');
        const list = await resp.json();
        const wsUrl = list[0].webSocketDebuggerUrl;
        const ws = new WebSocket(wsUrl);

        let msgId = 1;
        const send = (method, params = {}) => new Promise((resolve) => {
            const id = msgId++;
            const handler = (evt) => {
                const data = JSON.parse(evt.data);
                if (data.id === id) {
                    ws.removeEventListener('message', handler);
                    resolve(data.result);
                }
            };
            ws.addEventListener('message', handler);
            ws.send(JSON.stringify({ id, method, params }));
        });

        await new Promise(r => ws.onopen = r);

        console.log('Connected to CDP. Evaluating reference devices...');

        for (const dev of devices) {
            console.log(`\n========================================`);
            console.log(`DEVICE: ${dev.name} (${dev.w} x ${dev.h})`);
            console.log(`========================================`);

            await send('Emulation.setDeviceMetricsOverride', {
                width: dev.w,
                height: dev.h,
                deviceScaleFactor: 2.0,
                mobile: true
            });

            await send('Page.navigate', { url: 'http://127.0.0.1:8000/index.html' });
            await new Promise(r => setTimeout(r, 1000));

            // Measure elements and check for overflows
            const evalResult = await send('Runtime.evaluate', {
                expression: `(() => {
                    const issues = [];
                    // Check horizontal overflow
                    if (document.documentElement.scrollWidth > window.innerWidth) {
                        issues.push('HTML horizontal overflow: scrollWidth=' + document.documentElement.scrollWidth + ' vs innerWidth=' + window.innerWidth);
                    }
                    if (document.body.scrollWidth > window.innerWidth) {
                        issues.push('Body horizontal overflow: scrollWidth=' + document.body.scrollWidth + ' vs innerWidth=' + window.innerWidth);
                    }

                    // Check key elements
                    const elements = [
                        '.topBar', '.gridContainer', '.playerDeck', '.turntableStage',
                        '.trackMeta', '.timelineCon', '.mediaCon', '.volumeDeck',
                        '.dspDeck', '.visualizerDock', '.mobileTabBar'
                    ];

                    const layout = {};
                    elements.forEach(sel => {
                        const el = document.querySelector(sel);
                        if (!el) {
                            layout[sel] = 'NOT_FOUND';
                        } else {
                            const rect = el.getBoundingClientRect();
                            const style = window.getComputedStyle(el);
                            layout[sel] = {
                                top: Math.round(rect.top),
                                bottom: Math.round(rect.bottom),
                                width: Math.round(rect.width),
                                height: Math.round(rect.height),
                                display: style.display,
                                visibility: style.visibility
                            };
                            if (rect.right > window.innerWidth + 1) {
                                issues.push('Element ' + sel + ' overflows right: ' + Math.round(rect.right) + ' > ' + window.innerWidth);
                            }
                        }
                    });

                    // Check bottom tab buttons
                    const tabBtns = Array.from(document.querySelectorAll('.mobileTabBtn')).map(b => {
                        const rect = b.getBoundingClientRect();
                        return {
                            label: (b.innerText || '').trim().replace(/\\n/g, ' '),
                            w: Math.round(rect.width),
                            h: Math.round(rect.height),
                            visible: rect.width > 0 && rect.height > 0
                        };
                    });

                    // Check media buttons
                    const mediaButtons = Array.from(document.querySelectorAll('.mediaCon button')).map(b => {
                        const rect = b.getBoundingClientRect();
                        return { id: b.id, w: Math.round(rect.width), h: Math.round(rect.height) };
                    });

                    return { issues, layout, tabBtns, mediaButtons };
                })()`,
                returnByValue: true
            });

            const res = (evalResult.result && evalResult.result.value) || evalResult.value || {};
            if (evalResult.exceptionDetails) {
                console.error("Eval Exception:", evalResult.exceptionDetails);
            }
            console.log('Issues found:', res.issues.length ? res.issues : 'None (Clean)');
            console.log('TopBar height:', res.layout['.topBar']?.height, 'PlayerDeck height:', res.layout['.playerDeck']?.height);
            console.log('TurntableStage:', res.layout['.turntableStage']);
            console.log('TimelineCon:', res.layout['.timelineCon']);
            console.log('MediaCon:', res.layout['.mediaCon']);
            console.log('VolumeDeck:', res.layout['.volumeDeck']);
            console.log('DspDeck:', res.layout['.dspDeck']);
            console.log('VisualizerDock:', res.layout['.visualizerDock']);
            console.log('MobileTabBar:', res.layout['.mobileTabBar']);
            console.log('Tabs:', res.tabBtns);
        }

        // Audit Theme Contrast on Mobile
        console.log(`\n========================================`);
        console.log(`AUDITING CONTRAST ACROSS ALL 12 THEMES ON MOBILE`);
        console.log(`========================================`);

        for (const t of themes) {
            await send('Page.navigate', { url: `http://127.0.0.1:8000/index.html?theme=${t}&panel=playerDeck` });
            await new Promise(r => setTimeout(r, 600));

            const contrastResult = await send('Runtime.evaluate', {
                expression: `(() => {
                    function parseRgb(str) {
                        const m = str.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)/);
                        return m ? [parseInt(m[1]), parseInt(m[2]), parseInt(m[3])] : null;
                    }
                    function srgbToLinear(c) {
                        c = c / 255.0;
                        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
                    }
                    function relLuminance(rgb) {
                        return 0.2126 * srgbToLinear(rgb[0]) + 0.7152 * srgbToLinear(rgb[1]) + 0.0722 * srgbToLinear(rgb[2]);
                    }
                    function contrastRatio(rgb1, rgb2) {
                        if (!rgb1 || !rgb2) return 1.0;
                        const l1 = relLuminance(rgb1);
                        const l2 = relLuminance(rgb2);
                        return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
                    }

                    const targets = [
                        { sel: '#trackName', name: 'Track Title' },
                        { sel: '#artistName', name: 'Artist Name' },
                        { sel: '.albumName', name: 'Album Name' },
                        { sel: '#currentTime', name: 'Time Label' },
                        { sel: '.active.mobileTabBtn .mobileTabLabel', name: 'Active Tab Label' },
                        { sel: '.mobileTabBtn:not(.active) .mobileTabLabel', name: 'Inactive Tab Label' },
                        { sel: '.playPauseBtn', name: 'Play/Pause Button' },
                        { sel: '.skipBtn', name: 'Skip Button' },
                        { sel: '.dspBtn', name: 'DSP Button' }
                    ];

                    const results = [];
                    targets.forEach(t => {
                        const el = document.querySelector(t.sel);
                        if (!el) return;
                        const style = window.getComputedStyle(el);
                        const fg = parseRgb(style.color);
                        // find parent bg
                        let cur = el;
                        let bg = null;
                        while (cur) {
                            const bStyle = window.getComputedStyle(cur);
                            const bCol = parseRgb(bStyle.backgroundColor);
                            if (bCol && (bStyle.backgroundColor.indexOf('rgba') === -1 || !bStyle.backgroundColor.includes(', 0)'))) {
                                bg = bCol;
                                break;
                            }
                            cur = cur.parentElement;
                        }
                        if (!bg) bg = parseRgb(window.getComputedStyle(document.body).backgroundColor) || [10, 11, 14];
                        const ratio = contrastRatio(fg, bg);
                        results.push({ name: t.name, fg: style.color, bg: 'rgb(' + bg.join(',') + ')', ratio: ratio.toFixed(2) });
                    });
                    return results;
                })()`,
                returnByValue: true
            });

            console.log(`Theme: ${t.toUpperCase()}`);
            const cList = (contrastResult.result && contrastResult.result.value) || contrastResult.value || [];
            cList.forEach(r => {
                const pass = parseFloat(r.ratio) >= 4.5 ? 'PASS' : (parseFloat(r.ratio) >= 3.0 ? 'LARGE/GRAPHICAL' : 'FAIL');
                console.log(`  ${r.name}: ${r.ratio}:1 [${pass}] (${r.fg} on ${r.bg})`);
            });
        }

        ws.close();
    } finally {
        proc.kill();
    }
}

runAudit().catch(console.error);
