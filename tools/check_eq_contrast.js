const { spawn } = require('child_process');

const themes = [
    'default', 'nms', 'solar-eclipse', 'euclid-horizon', 'alien-paradise',
    'abyssal-void', 'dissonance', 'sentinel', 'minimalist-light',
    'minimalist-dark', 'minimalist-warm', 'minimalist-obsidian'
];

function parseRgb(c) {
    if (!c) return [255, 255, 255, 1];
    const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    if (!m) return [255, 255, 255, 1];
    return [parseInt(m[1]), parseInt(m[2]), parseInt(m[3]), m[4] !== undefined ? parseFloat(m[4]) : 1.0];
}

function srgb(c) {
    c = c / 255.0;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function lum(rgb) {
    return 0.2126 * srgb(rgb[0]) + 0.7152 * srgb(rgb[1]) + 0.0722 * srgb(rgb[2]);
}

function contrast(rgb1, rgb2) {
    const l1 = lum(rgb1), l2 = lum(rgb2);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

function comp(fg, bg) {
    const a = fg[3];
    return [
        Math.round(fg[0] * a + bg[0] * (1 - a)),
        Math.round(fg[1] * a + bg[1] * (1 - a)),
        Math.round(fg[2] * a + bg[2] * (1 - a))
    ];
}

async function run() {
    const proc = spawn('brave', [
        '--headless=new', '--disable-gpu', '--no-sandbox',
        '--remote-debugging-port=9223', '--user-data-dir=/tmp/brave_contrast_chk',
        'http://127.0.0.1:8000/index.html'
    ], { stdio: 'ignore' });

    await new Promise(r => setTimeout(r, 1500));

    const resp = await fetch('http://127.0.0.1:9223/json');
    const list = await resp.json();
    const ws = new WebSocket(list[0].webSocketDebuggerUrl);

    let msgId = 1;
    const send = (method, params = {}) => new Promise((resolve) => {
        const id = msgId++;
        const handler = (e) => {
            const data = JSON.parse(e.data);
            if (data.id === id) {
                ws.removeEventListener('message', handler);
                resolve(data.result);
            }
        };
        ws.addEventListener('message', handler);
        ws.send(JSON.stringify({ id, method, params }));
    });

    await new Promise(r => ws.onopen = r);

    const jsEval = `(() => {
        function parseRgb(c) {
            if (!c) return [255, 255, 255, 1];
            const m = c.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)(?:,\\s*([\\d.]+))?\\)/);
            if (!m) return [255, 255, 255, 1];
            return [parseInt(m[1]), parseInt(m[2]), parseInt(m[3]), m[4] !== undefined ? parseFloat(m[4]) : 1.0];
        }
        function comp(fg, bg) {
            const a = fg[3];
            return [
                Math.round(fg[0] * a + bg[0] * (1 - a)),
                Math.round(fg[1] * a + bg[1] * (1 - a)),
                Math.round(fg[2] * a + bg[2] * (1 - a))
            ];
        }

        const btn = document.getElementById('playerPeqBtn');
        const title = btn ? btn.querySelector('.eqDeckTitle') : null;
        const sub = btn ? btn.querySelector('.eqDeckSub') : null;
        const badge = btn ? btn.querySelector('.eqDeckBadge') : null;

        // Modal
        const modal = document.getElementById('peqModal');
        if (modal) {
            modal.style.display = 'flex';
            modal.classList.add('active');
        }

        const getElData = (el, parentBg) => {
            if (!el) return null;
            const style = window.getComputedStyle(el);
            let n = el;
            let stack = [];
            while (n && n !== document) {
                const bg = parseRgb(window.getComputedStyle(n).backgroundColor);
                if (bg[3] > 0.01) {
                    stack.push(bg);
                    if (bg[3] >= 0.95) break;
                }
                n = n.parentElement;
            }
            let effBg = parentBg || [10, 11, 14];
            for (let i = stack.length - 1; i >= 0; i--) {
                effBg = comp(stack[i], effBg);
            }
            const fg = parseRgb(style.color);
            return {
                text: (el.innerText || '').trim().slice(0, 25),
                color: style.color,
                bgColor: 'rgb(' + effBg.join(',') + ')',
                rawBg: style.backgroundColor,
                fgRgb: fg,
                bgRgb: effBg,
                fontSize: parseFloat(style.fontSize),
                fontWeight: style.fontWeight
            };
        };

        const rootBg = parseRgb(window.getComputedStyle(document.body).backgroundColor);

        return {
            deckBtn: getElData(btn, rootBg),
            deckTitle: getElData(title, rootBg),
            deckSub: getElData(sub, rootBg),
            deckBadge: getElData(badge, rootBg),
            modalCard: getElData(modal ? modal.querySelector('.peqModalCard') : null, rootBg),
            peqTitle: getElData(modal ? modal.querySelector('.peqHeaderTitle h3') : null, rootBg),
            peqSub: getElData(modal ? modal.querySelector('.peqHeaderSub') : null, rootBg),
            peqBypass: getElData(modal ? modal.querySelector('.peqBypassBtn') : null, rootBg),
            peqReset: getElData(modal ? modal.querySelector('.peqResetBtn') : null, rootBg),
            peqToolbarLabel: getElData(modal ? modal.querySelector('.peqToolbarLabel') : null, rootBg),
            peqSelect: getElData(modal ? modal.querySelector('.peqSelect') : null, rootBg),
            peqAutoEq: getElData(modal ? modal.querySelector('.peqAutoEqBtn') : null, rootBg),
            peqDspStrip: getElData(modal ? modal.querySelector('.peqDspStrip') : null, rootBg),
            peqDspBadge: getElData(modal ? modal.querySelector('.peqSectionBadge') : null, rootBg),
            peqDspTitle: getElData(modal ? modal.querySelector('.peqDspTitle') : null, rootBg),
            peqDspPill: getElData(modal ? modal.querySelector('.peqDspSummaryPill') : null, rootBg),
            peqDspBtn: getElData(modal ? modal.querySelector('.peqDspBtn') : null, rootBg),
            peqDspName: getElData(modal ? modal.querySelector('.peqDspName') : null, rootBg),
            peqDspSpec: getElData(modal ? modal.querySelector('.peqDspSpec') : null, rootBg),
            peqFaderDb: getElData(modal ? modal.querySelector('.peqFaderDb') : null, rootBg),
            peqFaderHz: getElData(modal ? modal.querySelector('.peqFaderHz') : null, rootBg)
        };
    })()`;

    for (const t of themes) {
        await send('Runtime.evaluate', {
            expression: `document.documentElement.setAttribute('data-theme', '${t}'); void document.body.offsetHeight;`
        });
        await new Promise(r => setTimeout(r, 250));

        const res = await send('Runtime.evaluate', {
            expression: jsEval,
            returnByValue: true
        });

        const data = (res.result && res.result.value) || {};
        console.log(`\n================== THEME: ${t} ==================`);

        for (const [key, item] of Object.entries(data)) {
            if (!item) continue;
            const cr = contrast(comp(item.fgRgb, item.bgRgb), item.bgRgb);
            const isLarge = item.fontSize >= 24 || (item.fontSize >= 18.5 && (item.fontWeight === 'bold' || parseInt(item.fontWeight) >= 700));
            const target = 7.0; // strict AAA target
            const status = cr >= target ? 'PASS (AAA)' : cr >= 4.5 ? 'PASS (AA)' : 'FAIL (<4.5)';
            if (cr < target) {
                console.log(`  [${status}] ${key}: CR=${cr.toFixed(2)}:1 (fg: ${item.color}, bg: ${item.bgColor})`);
            }
        }
    }

    proc.kill();
    process.exit(0);
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});
