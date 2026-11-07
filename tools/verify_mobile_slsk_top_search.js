const fs = require('fs');

async function main() {
    const listRes = await (await fetch('http://127.0.0.1:9227/json')).json();
    const page = listRes.find(p => p.type === 'page' && p.url.includes('androidplatform.net'));
    if (!page) {
        console.error('No suitable page target found:', listRes);
        process.exit(1);
    }

    console.log('Target found:', page.title, page.url);
    const ws = new WebSocket(page.webSocketDebuggerUrl);

    let id = 1;
    const send = (method, params = {}) => new Promise((resolve, reject) => {
        const reqId = id++;
        const timeout = setTimeout(() => reject(new Error(`CDP Timeout on ${method}`)), 12000);
        const handler = (e) => {
            const d = JSON.parse(e.data);
            if (d.id === reqId) {
                clearTimeout(timeout);
                ws.removeEventListener('message', handler);
                resolve(d.result);
            }
        };
        ws.addEventListener('message', handler);
        ws.send(JSON.stringify({ id: reqId, method, params }));
    });

    await new Promise(r => ws.onopen = r);
    console.log('Connected to Chrome DevTools Protocol on Android emulator');

    await send('DOM.enable');
    await send('CSS.enable');
    await send('Runtime.enable');
    await send('Page.enable');

    async function takeScreenshot(outputPath) {
        const snap = await send('Page.captureScreenshot', { format: 'png' });
        if (snap && snap.data) {
            fs.writeFileSync(outputPath, Buffer.from(snap.data, 'base64'));
            console.log(`Saved screenshot -> ${outputPath}`);
        }
    }

    // 1. Switch to Soulseek tab
    console.log("\n[1/4] Switching to Soulseek Tab on Mobile...");
    await send('Runtime.evaluate', {
        expression: `(() => {
            const b = document.getElementById("mobileSoulseekTabBtn");
            if (b) b.click();
        })()`
    });
    await new Promise(r => setTimeout(r, 600));

    // 2. Measure geometry and layout
    console.log("\n[2/4] Measuring Layout & Positioning of Top Search & Filters...");
    const measurements = await send('Runtime.evaluate', {
        expression: `(() => {
            const ws = document.getElementById("soulseekWorkspace");
            const cp = document.getElementById("slskControlsPanel");
            const tb = document.querySelector(".slskToolbar");
            const sa = document.querySelector(".slskSearchArea");
            const sr = document.querySelector(".slskSearchRow");
            const si = document.getElementById("slskSearchInput");
            const sm = document.getElementById("slskSearchModeSelect");
            const sb = document.getElementById("slskSearchSubmitBtn");
            const fr = document.querySelector(".slskFilterRow");
            const fg = document.getElementById("slskFilterChips");
            const ftBtn = document.getElementById("slskTextFilterToggleBtn");
            const tfc = document.getElementById("slskTextFiltersCon");
            const rc = document.querySelector(".slskResultsCon");
            const tbBottom = document.getElementById("slskPanelToggleBar");

            const getBox = el => el ? {
                top: Math.round(el.getBoundingClientRect().top),
                bottom: Math.round(el.getBoundingClientRect().bottom),
                left: Math.round(el.getBoundingClientRect().left),
                width: Math.round(el.getBoundingClientRect().width),
                height: Math.round(el.getBoundingClientRect().height),
                sw: el.scrollWidth,
                cw: el.clientWidth,
                display: window.getComputedStyle(el).display,
                order: window.getComputedStyle(el).order
            } : null;

            return {
                viewport: { w: window.innerWidth, h: window.innerHeight },
                doc: { sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth },
                workspace: getBox(ws),
                controlsPanel: getBox(cp),
                toolbar: getBox(tb),
                searchArea: getBox(sa),
                searchRow: getBox(sr),
                searchInput: getBox(si),
                searchMode: getBox(sm),
                searchBtn: getBox(sb),
                filterRow: getBox(fr),
                filterGroup: getBox(fg),
                filterToggleBtn: getBox(ftBtn),
                textFiltersCon: getBox(tfc),
                resultsContainer: getBox(rc),
                toggleBarBottom: tbBottom ? { display: window.getComputedStyle(tbBottom).display } : null
            };
        })()`,
        returnByValue: true
    });

    const data = measurements && measurements.result ? measurements.result.value : (measurements ? measurements.value : null);
    console.log('Telemetry Data:', JSON.stringify(data, null, 2));
    const isTopSearch = data.controlsPanel.top < data.resultsContainer.top;
    console.log(`\nVerification: Is Controls Panel (Search/Filters) placed at TOP above results? ${isTopSearch ? 'YES! (PASSED)' : 'NO (FAILED)'}`);
    console.log(`ControlsPanel order: ${data.controlsPanel.order}, ResultsCon order: ${data.resultsContainer.order}`);
    console.log(`ControlsPanel height: ${data.controlsPanel.height}px, ResultsCon height: ${data.resultsContainer.height}px`);
    console.log(`Bottom toggle bar display: ${data.toggleBarBottom ? data.toggleBarBottom.display : 'none'}`);
    console.log(`Document horizontal overflow check: sw=${data.doc.sw}, cw=${data.doc.cw} (Overflow: ${data.doc.sw > data.doc.cw ? 'LEAK' : '0 LEAKS - PASSED'})`);

    await takeScreenshot('/home/lien/.gemini/antigravity/brain/8ef29818-f6ab-4782-82fa-f162ed09e52c/android_slsk_top_search_default.png');

    // 3. Test interacting with format chips and search input
    console.log("\n[3/4] Testing Format Chips & Search Query Interaction...");
    await send('Runtime.evaluate', {
        expression: `(() => {
            const flacChip = document.querySelector('.slskChip[data-filter="flac"]');
            if (flacChip) flacChip.click();
            const input = document.getElementById("slskSearchInput");
            if (input) {
                input.value = "Daft Punk";
                input.dispatchEvent(new Event('input', { bubbles: true }));
            }
        })()`
    });
    await new Promise(r => setTimeout(r, 400));
    await takeScreenshot('/home/lien/.gemini/antigravity/brain/8ef29818-f6ab-4782-82fa-f162ed09e52c/android_slsk_top_search_flac_active.png');

    // 4. Test toggling advanced text filters
    console.log("\n[4/4] Testing Advanced Text Filters Toggle Button...");
    await send('Runtime.evaluate', {
        expression: `(() => {
            const btn = document.getElementById("slskTextFilterToggleBtn");
            if (btn) btn.click();
        })()`
    });
    await new Promise(r => setTimeout(r, 400));

    const textFilterState = await send('Runtime.evaluate', {
        expression: `(() => {
            const tfc = document.getElementById("slskTextFiltersCon");
            return {
                isOpen: tfc ? tfc.classList.contains('open') : false,
                display: tfc ? window.getComputedStyle(tfc).display : 'none',
                h: tfc ? tfc.getBoundingClientRect().height : 0
            };
        })()`,
        returnByValue: true
    });
    const tfVal = textFilterState && textFilterState.result ? textFilterState.result.value : (textFilterState ? textFilterState.value : null);
    console.log('Text Filters Expanded State:', tfVal);

    await takeScreenshot('/home/lien/.gemini/antigravity/brain/8ef29818-f6ab-4782-82fa-f162ed09e52c/android_slsk_top_search_text_filters_expanded.png');

    // Toggle text filters closed again
    await send('Runtime.evaluate', {
        expression: `(() => {
            const btn = document.getElementById("slskTextFilterToggleBtn");
            if (btn) btn.click();
        })()`
    });
    await new Promise(r => setTimeout(r, 300));

    console.log("\nAll live Android emulator tests completed successfully!");
    ws.close();
    process.exit(0);
}

main().catch(err => {
    console.error('Error during verification:', err);
    process.exit(1);
});
