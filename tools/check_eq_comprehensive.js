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
        '--remote-debugging-port=9230', '--user-data-dir=/tmp/b_eq_full',
        'http://127.0.0.1:8000/index.html'
    ], { stdio: 'ignore' });

    await new Promise(r => setTimeout(r, 1200));
    const list = await (await fetch('http://127.0.0.1:9230/json')).json();
    const ws = new WebSocket(list[0].webSocketDebuggerUrl);
    let msgId = 1;
    const send = (method, params = {}) => new Promise((resolve) => {
        const id = msgId++;
        const handler = (e) => {
            const data = JSON.parse(e.data);
            if (data.id === id) { ws.removeEventListener('message', handler); resolve(data.result); }
        };
        ws.addEventListener('message', handler);
        ws.send(JSON.stringify({ id, method, params }));
    });
    await new Promise(r => ws.onopen = r);

    const checkScript = `(() => {
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

        const getEffBg = (el) => {
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
            let eff = [10, 11, 14];
            for (let i = stack.length - 1; i >= 0; i--) {
                eff = comp(stack[i], eff);
            }
            return eff;
        };

        const checkEl = (name, el) => {
            if (!el) return null;
            const style = window.getComputedStyle(el);
            const effBg = getEffBg(el);
            const fg = parseRgb(style.color);
            return {
                name,
                text: (el.innerText || el.value || '').trim().slice(0, 25),
                fg,
                effBg,
                fgStr: style.color,
                bgStr: 'rgb(' + effBg.join(',') + ')',
                fontSize: parseFloat(style.fontSize),
                fontWeight: style.fontWeight
            };
        };

        const items = [];
        const btn = document.getElementById('playerPeqBtn');
        if (btn) {
            items.push(checkEl('deckBtn_Title', btn.querySelector('.eqDeckTitle')));
            items.push(checkEl('deckBtn_Sub', btn.querySelector('.eqDeckSub')));
            items.push(checkEl('deckBtn_Badge', btn.querySelector('.eqDeckBadge')));
            items.push(checkEl('deckBtn_DspBadge', btn.querySelector('.eqDeckDspBadge')));
        }

        // Modal
        const modal = document.getElementById('peqModal');
        if (modal) {
            modal.style.display = 'flex';
            modal.classList.add('active');

            items.push(checkEl('modal_Title', modal.querySelector('.peqHeaderTitle h3')));
            items.push(checkEl('modal_Sub', modal.querySelector('.peqHeaderSub')));
            items.push(checkEl('modal_BypassBtn', modal.querySelector('.peqBypassBtn')));
            items.push(checkEl('modal_ResetBtn', modal.querySelector('.peqResetBtn')));
            items.push(checkEl('modal_ToolbarLabel', modal.querySelector('.peqToolbarLabel')));
            items.push(checkEl('modal_Select', modal.querySelector('.peqSelect')));
            items.push(checkEl('modal_AutoEqBtn', modal.querySelector('.peqAutoEqBtn')));
            items.push(checkEl('modal_DspBadge', modal.querySelector('.peqSectionBadge')));
            items.push(checkEl('modal_DspTitle', modal.querySelector('.peqDspTitle')));
            items.push(checkEl('modal_DspPill', modal.querySelector('.peqDspSummaryPill')));

            const dspBtns = modal.querySelectorAll('.peqDspBtn');
            dspBtns.forEach((b, idx) => {
                const name = b.querySelector('.peqDspName');
                const spec = b.querySelector('.peqDspSpec');
                const isAct = b.classList.contains('active') ? '_active' : '_inactive';
                items.push(checkEl('modal_DspName' + isAct + '_' + idx, name));
                items.push(checkEl('modal_DspSpec' + isAct + '_' + idx, spec));
            });

            // Spatial row
            const spatialLabels = modal.querySelectorAll('.peqSpatialLabel');
            spatialLabels.forEach((l, idx) => items.push(checkEl('modal_SpatialLabel_' + idx, l)));
            const spatialVals = modal.querySelectorAll('.peqSpatialValue');
            spatialVals.forEach((v, idx) => items.push(checkEl('modal_SpatialVal_' + idx, v)));
            const miniBtns = modal.querySelectorAll('.peqMiniResetBtn, .peqMiniModeBtn');
            miniBtns.forEach((b, idx) => items.push(checkEl('modal_SpatialBtn_' + idx, b)));

            // Faders
            const faderDbs = modal.querySelectorAll('.peqFaderDb');
            faderDbs.forEach((d, idx) => items.push(checkEl('modal_FaderDb_' + idx, d)));
            const faderHzs = modal.querySelectorAll('.peqFaderHz');
            faderHzs.forEach((h, idx) => items.push(checkEl('modal_FaderHz_' + idx, h)));

            // Db labels on canvas
            const dbLabels = modal.querySelectorAll('.peqDbLabel');
            dbLabels.forEach((d, idx) => items.push(checkEl('modal_CanvasDbLabel_' + idx, d)));
        }

        return items.filter(Boolean);
    })()`;

    for (const t of themes) {
        await send('Runtime.evaluate', {
            expression: `document.documentElement.setAttribute('data-theme', '${t}'); void document.body.offsetHeight;`
        });
        await new Promise(r => setTimeout(r, 250));

        const res = await send('Runtime.evaluate', {
            expression: checkScript,
            returnByValue: true
        });

        const items = (res.result && res.result.value) || [];
        console.log(`\n================== THEME: ${t} (${items.length} items evaluated) ==================`);

        let issues = 0;
        for (const item of items) {
            const fgComp = comp(item.fg, item.effBg);
            const cr = contrast(fgComp, item.effBg);
            // Strict WCAG AAA: >= 7.0 for normal, >= 4.5 for large
            const isLarge = item.fontSize >= 24 || (item.fontSize >= 18.5 && (item.fontWeight === 'bold' || parseInt(item.fontWeight) >= 700));
            const minReq = isLarge ? 4.5 : 7.0;

            if (cr < minReq) {
                issues++;
                const lvl = cr < 4.5 ? 'CRITICAL_FAIL (<4.5)' : 'FAIL_AAA (<7.0)';
                console.log(`  [${lvl}] ${item.name} ("${item.text}"): CR=${cr.toFixed(2)}:1 (fg: ${item.fgStr}, bg: ${item.bgStr})`);
            }
        }
        if (issues === 0) {
            console.log(`  ALL ${items.length} ITEMS PASS WCAG 2.1 AAA (>= 7:1)!`);
        }
    }

    proc.kill();
    process.exit(0);
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});
