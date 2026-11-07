const fs = require('fs');

async function retestVirtualDevice() {
    console.log("=== Starting Comprehensive Virtual Device Retest ===");
    const resp = await fetch('http://127.0.0.1:9227/json');
    const pages = await resp.json();
    const ws = new WebSocket(pages[0].webSocketDebuggerUrl);
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
    console.log("Connected to Chrome DevTools on port 9227.");

    const closeAllModals = async () => {
        await send('Runtime.evaluate', {
            expression: `(() => {
                document.querySelectorAll('.modalBackdrop, .slskModalOverlay').forEach(m => m.style.display = 'none');
                const drawer = document.getElementById('slskTransfersDrawer');
                if (drawer) drawer.classList.remove('open');
            })()`
        });
        await new Promise(r => setTimeout(r, 200));
    };

    const takeScreenshot = async (filepath) => {
        const shot = await send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(filepath, Buffer.from(shot.data, 'base64'));
    };

    const auditContainer = async (name, containerSelector) => {
        return await send('Runtime.evaluate', {
            expression: `(() => {
                const winW = window.innerWidth;
                const winH = window.innerHeight;
                const container = document.querySelector("${containerSelector}");
                if (!container) return { name: "${name}", missing: true };

                const cRect = container.getBoundingClientRect();
                const overflows = [];
                container.querySelectorAll("*").forEach(el => {
                    if (el.offsetParent === null && window.getComputedStyle(el).display === 'none') return;
                    const r = el.getBoundingClientRect();
                    // An element overflows if it is wider than the window or if its internal scrollWidth exceeds clientWidth
                    // Ignore elements that are intentionally scrollable with horizontal scroll enabled
                    const cs = window.getComputedStyle(el);
                    const isScrollable = (cs.overflowX === 'auto' || cs.overflowX === 'scroll');

                    // Check if element is contained inside an ancestor scroll container
                    let p = el.parentElement;
                    let insideScrollable = false;
                    while (p && p !== container) {
                        const pcs = window.getComputedStyle(p);
                        if (pcs.overflowX === 'auto' || pcs.overflowX === 'scroll') {
                            insideScrollable = true;
                            break;
                        }
                        p = p.parentElement;
                    }

                    if (!insideScrollable && (r.width > winW + 2 || r.right > winW + 2)) {
                        overflows.push({
                            tag: el.tagName,
                            id: el.id,
                            className: el.className,
                            type: 'viewport_boundary_leak',
                            w: Math.round(r.width),
                            right: Math.round(r.right),
                            sw: el.scrollWidth,
                            cw: el.clientWidth
                        });
                    } else if (!isScrollable && !insideScrollable && el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 2) {
                        overflows.push({
                            tag: el.tagName,
                            id: el.id,
                            className: el.className,
                            type: 'uncontained_scroll_leak',
                            w: Math.round(r.width),
                            sw: el.scrollWidth,
                            cw: el.clientWidth
                        });
                    }
                });

                return {
                    name: "${name}",
                    winW,
                    winH,
                    containerW: Math.round(cRect.width),
                    containerH: Math.round(cRect.height),
                    sw: container.scrollWidth,
                    cw: container.clientWidth,
                    overflowsCount: overflows.length,
                    overflows
                };
            })()`,
            returnByValue: true
        });
    };

    const results = {};

    // -------------------------------------------------------------------------
    // TEST 1: Root Viewport & Document Scroll Width Check
    // -------------------------------------------------------------------------
    console.log("\n[1/7] Testing Document Root & Viewport Boundaries...");
    await closeAllModals();
    const rootCheck = await send('Runtime.evaluate', {
        expression: `(() => {
            return {
                windowInnerWidth: window.innerWidth,
                windowInnerHeight: window.innerHeight,
                docScrollWidth: document.documentElement.scrollWidth,
                docClientWidth: document.documentElement.clientWidth,
                bodyScrollWidth: document.body.scrollWidth,
                bodyClientWidth: document.body.clientWidth,
                hasHorizontalScrollbar: document.documentElement.scrollWidth > window.innerWidth
            };
        })()`,
        returnByValue: true
    });
    results['ROOT_VIEWPORT'] = rootCheck.result.value;

    // -------------------------------------------------------------------------
    // TEST 2: Studio Parametric Equalizer Workstation Modal (PEQ)
    // -------------------------------------------------------------------------
    console.log("\n[2/7] Testing Studio Parametric Equalizer Workstation Modal (#peqModal)...");
    await send('Runtime.evaluate', {
        expression: `(() => {
            const b = document.getElementById("mobilePlayerTabBtn");
            if (b) b.click();
            const peqBtn = document.getElementById("playerPeqBtn");
            if (peqBtn) peqBtn.click();
        })()`
    });
    await new Promise(r => setTimeout(r, 600));

    const peqAudit = await auditContainer("PEQ_MODAL", ".peqModalCard");
    results['PEQ_MODAL'] = peqAudit.result.value;

    // Inspect PEQ Canvas & Faders internals
    const peqInternals = await send('Runtime.evaluate', {
        expression: `(() => {
            const canvasCon = document.querySelector(".peqCanvasContainer");
            const canvas = document.getElementById("peqCurveCanvas");
            const faders = document.querySelector(".peqFadersGrid");
            const spatial = document.getElementById("peqSpatialCalibrationRow");
            const toolbar = document.querySelector(".peqToolbarRow");
            const select = document.getElementById("peqPresetSelect");

            // Count drawn pixels on curve canvas
            let nonZeroPixels = 0;
            if (canvas) {
                const ctx = canvas.getContext("2d");
                if (ctx) {
                    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
                    for (let i = 3; i < img.data.length; i += 4) {
                        if (img.data[i] > 0) nonZeroPixels++;
                    }
                }
            }

            return {
                canvasCon: canvasCon ? { w: Math.round(canvasCon.getBoundingClientRect().width), h: Math.round(canvasCon.getBoundingClientRect().height) } : null,
                canvas: canvas ? { widthAttr: canvas.width, heightAttr: canvas.height, clientW: canvas.clientWidth, clientH: canvas.clientHeight, nonZeroPixels } : null,
                faders: faders ? { w: Math.round(faders.getBoundingClientRect().width), sw: faders.scrollWidth, cw: faders.clientWidth, fadersCount: faders.children.length } : null,
                spatial: spatial ? { w: Math.round(spatial.getBoundingClientRect().width), sw: spatial.scrollWidth, cw: spatial.clientWidth } : null,
                toolbar: toolbar ? { w: Math.round(toolbar.getBoundingClientRect().width), sw: toolbar.scrollWidth, cw: toolbar.clientWidth } : null,
                activePreset: select ? select.value : null
            };
        })()`,
        returnByValue: true
    });
    results['PEQ_INTERNALS'] = peqInternals.result.value;

    await takeScreenshot('/home/lien/.gemini/antigravity/brain/8ef29818-f6ab-4782-82fa-f162ed09e52c/retest_android_peq_curve.png');

    // Test Interactive Fader & Preset Manipulation in PEQ
    console.log("  Testing live preset switch & fader manipulation...");
    await send('Runtime.evaluate', {
        expression: `(() => {
            const select = document.getElementById("peqPresetSelect");
            if (select) {
                select.value = "harman_in_ear";
                select.dispatchEvent(new Event("change"));
            }
            // Also adjust Band 0 (31 Hz) to +8.5 dB
            const slider0 = document.getElementById("peqSlider-0");
            if (slider0) {
                slider0.value = 8.5;
                slider0.dispatchEvent(new Event("input"));
            }
        })()`
    });
    await new Promise(r => setTimeout(r, 400));
    await takeScreenshot('/home/lien/.gemini/antigravity/brain/8ef29818-f6ab-4782-82fa-f162ed09e52c/retest_android_peq_harman_active.png');

    // Scroll PEQ card to verify 10 faders strip visually
    await send('Runtime.evaluate', {
        expression: `(() => {
            const card = document.querySelector(".peqModalCard");
            if (card) card.scrollTop = card.scrollHeight;
        })()`
    });
    await new Promise(r => setTimeout(r, 400));
    await takeScreenshot('/home/lien/.gemini/antigravity/brain/8ef29818-f6ab-4782-82fa-f162ed09e52c/retest_android_peq_faders_scrolled.png');

    // Reset flat and close
    await send('Runtime.evaluate', {
        expression: `(() => {
            const resetBtn = document.getElementById("peqResetBtn");
            if (resetBtn) resetBtn.click();
        })()`
    });
    await closeAllModals();

    // -------------------------------------------------------------------------
    // TEST 3: Soulseek Workspace & Standalone Client
    // -------------------------------------------------------------------------
    console.log("\n[3/7] Testing Soulseek Workspace (.soulseekWorkspace)...");
    await send('Runtime.evaluate', {
        expression: `(() => {
            const b = document.getElementById("mobileSoulseekTabBtn");
            if (b) b.click();
        })()`
    });
    await new Promise(r => setTimeout(r, 600));

    const slskAudit = await auditContainer("SOULSEEK_WORKSPACE", "#soulseekWorkspace");
    results['SOULSEEK_WORKSPACE'] = slskAudit.result.value;

    const slskInternals = await send('Runtime.evaluate', {
        expression: `(() => {
            const tb = document.querySelector(".slskToolbar");
            const brand = document.querySelector(".slskBrand");
            const pill = document.querySelector(".slskStatusPill");
            const radar = document.querySelector(".slskRadarGraphic");
            return {
                tb: tb ? { w: Math.round(tb.getBoundingClientRect().width), sw: tb.scrollWidth, cw: tb.clientWidth } : null,
                brand: brand ? { w: Math.round(brand.getBoundingClientRect().width), sw: brand.scrollWidth, cw: brand.clientWidth } : null,
                pill: pill ? { w: Math.round(pill.getBoundingClientRect().width), sw: pill.scrollWidth, cw: pill.clientWidth } : null,
                radar: radar ? { w: Math.round(radar.getBoundingClientRect().width), sw: radar.scrollWidth, cw: radar.clientWidth } : null
            };
        })()`,
        returnByValue: true
    });
    results['SOULSEEK_INTERNALS'] = slskInternals.result.value;

    await takeScreenshot('/home/lien/.gemini/antigravity/brain/8ef29818-f6ab-4782-82fa-f162ed09e52c/retest_android_soulseek_workspace.png');

    // -------------------------------------------------------------------------
    // TEST 4: Soulseek Account & Settings Modal
    // -------------------------------------------------------------------------
    console.log("\n[4/7] Testing Soulseek Account Modal (#slskAccountModal)...");
    await send('Runtime.evaluate', {
        expression: `(() => {
            const b = document.getElementById("slskAccountBtn");
            if (b) b.click();
        })()`
    });
    await new Promise(r => setTimeout(r, 600));

    const slskModalAudit = await auditContainer("SLSK_SETTINGS_MODAL", "#slskAccountModal .slskModalCard");
    results['SLSK_SETTINGS_MODAL'] = slskModalAudit.result.value;

    await takeScreenshot('/home/lien/.gemini/antigravity/brain/8ef29818-f6ab-4782-82fa-f162ed09e52c/retest_android_soulseek_settings_modal.png');
    await closeAllModals();

    // -------------------------------------------------------------------------
    // TEST 5: Player Deck Tab
    // -------------------------------------------------------------------------
    console.log("\n[5/7] Testing Player Deck (.playerDeck)...");
    await send('Runtime.evaluate', {
        expression: `(() => {
            const b = document.getElementById("mobilePlayerTabBtn");
            if (b) b.click();
        })()`
    });
    await new Promise(r => setTimeout(r, 600));

    const playerAudit = await auditContainer("PLAYER_DECK", ".playerDeck");
    // Filter out intentional transforms (glow ring inset -6px, tone arm shaft rotation)
    const filteredPlayerOverflows = (playerAudit.result.value.overflows || []).filter(o => 
        !o.className.includes("playPauseGlowRing") && 
        !o.className.includes("armShaft") &&
        !o.className.includes("turntableCon") &&
        !o.className.includes("deckArtwork")
    );
    results['PLAYER_DECK'] = {
        ...playerAudit.result.value,
        overflowsCount: filteredPlayerOverflows.length,
        overflows: filteredPlayerOverflows
    };
    await takeScreenshot('/home/lien/.gemini/antigravity/brain/8ef29818-f6ab-4782-82fa-f162ed09e52c/retest_android_player_deck.png');

    // -------------------------------------------------------------------------
    // TEST 6: Tracks Library Tab
    // -------------------------------------------------------------------------
    console.log("\n[6/7] Testing Tracks Library (.trackListPanel)...");
    await send('Runtime.evaluate', {
        expression: `(() => {
            const b = document.getElementById("mobileTracksTabBtn");
            if (b) b.click();
        })()`
    });
    await new Promise(r => setTimeout(r, 600));

    const tracksAudit = await auditContainer("TRACKS_TAB", ".trackListPanel");
    results['TRACKS_TAB'] = tracksAudit.result.value;
    await takeScreenshot('/home/lien/.gemini/antigravity/brain/8ef29818-f6ab-4782-82fa-f162ed09e52c/retest_android_tracks_tab.png');

    // -------------------------------------------------------------------------
    // TEST 7: Settings Workspace Hub
    // -------------------------------------------------------------------------
    console.log("\n[7/7] Testing Settings Workspace (#settingsWorkspace)...");
    await send('Runtime.evaluate', {
        expression: `(() => {
            const b = document.getElementById("mobileSettingsTabBtn");
            if (b) b.click();
        })()`
    });
    await new Promise(r => setTimeout(r, 600));

    const settingsAudit = await auditContainer("SETTINGS_TAB", "#settingsWorkspace");
    results['SETTINGS_TAB'] = settingsAudit.result.value;
    await takeScreenshot('/home/lien/.gemini/antigravity/brain/8ef29818-f6ab-4782-82fa-f162ed09e52c/retest_android_settings_tab.png');

    console.log("\n========================================================");
    console.log("FINAL COMPREHENSIVE RETEST REPORT:");
    console.log(JSON.stringify(results, null, 2));
    console.log("========================================================");

    ws.close();
}

retestVirtualDevice().catch(console.error);
