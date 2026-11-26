import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PeakLimiter } from '../scripts/modules/peak-limiter.js';
import { PcmReader } from '../scripts/modules/pcm-reader.js';
import { store } from '../scripts/modules/state.js';
import { MediaSessionController } from '../scripts/modules/media-session.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

// 1. Top bar cleanup, Lyrics empty state, Settings scrollbar/layout, Marquee & Pop CSS
const html = read('index.html');
assert.ok(!html.includes('brandLogo') && !html.includes('brandLiveMeter'), 'topBar brand header removed');
assert.ok(!html.includes('id="toggleFolderBtn"'), 'topBar Add music button removed');
assert.ok(html.includes('id="workspaceSwitcher"') && html.includes('id="headerSearchContainer"') && html.includes('id="topSettingsBtn"'), 'core topBar navigation preserved');
assert.ok(!html.includes('USLT/LYRICS tag'), 'bottom lyrics USLT description removed');
assert.ok(html.includes('class="lyricsCon lyricsActiveHidden is-empty"'), 'lyrics container starts with is-empty');
assert.ok(html.includes('data-precision="native"'), 'native bypass precision option present');

const layoutCss = read('stylesheets/layout.css');
assert.ok(!/\.topBar[\s\S]{0,400}border-bottom:\s*1px/.test(layoutCss), 'topBar bottom border removed in layout.css');
assert.ok(!/\.mobileFolderBtn\s*\{\s*display:\s*none;\s*\}/.test(layoutCss), 'Add folder remains accessible in desktop Library Sort & Tools');

const componentsCss = read('stylesheets/components.css');
assert.match(componentsCss, /@keyframes marqueeScroll[\s\S]*44%,\s*56%[\s\S]*88%,\s*100%\s*\{\s*transform:\s*translateX\(0\)/, 'marquee animates left and right back to origin');

const interactionCss = read('stylesheets/interaction.css');
assert.ok(!interactionCss.includes('@keyframes cachyBtnPop') && interactionCss.includes('scale:.975'), 'state-driven role-specific motion replaces click-pop animation');
assert.ok(!/transform:\s*none;\s*\}/.test(interactionCss.split('@media (prefers-reduced-motion:reduce)')[0]), 'active button transform not suppressed outside reduced-motion');
assert.ok(interactionCss.includes('@media (prefers-reduced-motion:reduce)'), 'reduced-motion guard present');
assert.ok(interactionCss.includes('scrollbar-width: none'), 'settings scrollbar hidden');
assert.ok(interactionCss.includes('interpolate-size: allow-keywords') && interactionCss.includes('@keyframes cachyDropdownIn'), 'subtle dropdown animations present');
assert.ok(interactionCss.includes('.lyricsCon.is-empty .lyricsScrollArea') && interactionCss.includes('overflow: hidden'), 'empty lyrics non-scrollable');

// 2. Marquee JS and Lyrics JS contracts
const marqueeJs = read('scripts/modules/player-marquee.js');
assert.ok(marqueeJs.includes('el.clientWidth <= 0'), 'marquee culls hidden measurement');
const lyricsJs = read('scripts/modules/lyrics.js');
assert.ok(lyricsJs.includes("lyricsCon?.classList.add('is-empty')") && !lyricsJs.includes('USLT/LYRICS'), 'lyrics.js marks empty state non-scrollable without bottom hint');

// 3. PeakLimiter bit-exact parity against reference 32-tap Blackman-windowed sinc implementation
class ReferencePeakLimiter {
    constructor(sampleRate, ceiling = 10 ** (-0.6 / 20)) {
        this.ceiling = ceiling;
        this.delay = Math.max(40, Math.round(sampleRate * 0.0015));
        this.release = 1 - Math.exp(-1 / (0.09 * sampleRate));
        this.taps = 32;
        this.historyL = new Float64Array(this.taps);
        this.historyR = new Float64Array(this.taps);
        this.kernel = new Float64Array(3 * this.taps);
        for (let phase = 1; phase < 4; phase++) {
            let sum = 0;
            for (let j = 0; j < this.taps; j++) {
                const x = j - (this.taps / 2 - 1) - phase / 4;
                const sinc = Math.abs(x) < 1e-12 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x);
                const w = Math.abs(x) >= this.taps / 2 ? 0 : 0.42 + 0.5 * Math.cos(2 * Math.PI * x / this.taps) + 0.08 * Math.cos(4 * Math.PI * x / this.taps);
                const i = (phase - 1) * this.taps + j;
                sum += this.kernel[i] = sinc * w;
            }
            for (let j = 0; j < this.taps; j++) this.kernel[(phase - 1) * this.taps + j] /= sum;
        }
        this.audioL = new Float64Array(this.delay + 1);
        this.audioR = new Float64Array(this.delay + 1);
        this.window = this.delay + this.taps;
        this.peaks = new Float64Array(this.window + 2);
        this.indices = new Float64Array(this.window + 2);
        this.histPos = this.audioPos = this.head = this.tail = this.index = 0;
        this.gain = 1; this.left = 0; this.right = 0;
    }
    process(left, right, margin = 1e-7) {
        const hL = this.historyL, hR = this.historyR, k = this.kernel, n = this.taps;
        hL[this.histPos] = left; hR[this.histPos] = right;
        this.histPos = (this.histPos + 1) & (n - 1);
        let peak = Math.max(Math.abs(left), Math.abs(right));
        for (let p = 0; p < 3; p++) {
            let l = 0, r = 0;
            for (let j = 0; j < n; j++) {
                const ix = (this.histPos + j) & (n - 1), c = k[p * n + j];
                l += hL[ix] * c; r += hR[ix] * c;
            }
            peak = Math.max(peak, Math.abs(l), Math.abs(r));
        }
        const cap = this.peaks.length, i = this.index++;
        while (this.head !== this.tail && this.indices[this.head] < i - this.window) this.head = (this.head + 1) % cap;
        while (this.head !== this.tail) {
            const last = (this.tail + cap - 1) % cap;
            if (this.peaks[last] > peak) break;
            this.tail = last;
        }
        this.peaks[this.tail] = peak; this.indices[this.tail] = i; this.tail = (this.tail + 1) % cap;
        const read = (this.audioPos + 1) % this.audioL.length;
        const delayedL = this.audioL[read], delayedR = this.audioR[read];
        this.audioL[this.audioPos] = left; this.audioR[this.audioPos] = right; this.audioPos = read;
        const max = this.peaks[this.head];
        const target = Math.min(1, Math.max(0, this.ceiling * 0.982878873 - margin) / Math.max(max, 1e-30));
        this.gain = target < this.gain ? target : this.gain + (target - this.gain) * this.release;
        const delayedPeak = Math.max(Math.abs(delayedL), Math.abs(delayedR));
        if (delayedPeak > 0) this.gain = Math.min(this.gain, Math.max(0, this.ceiling - margin) / delayedPeak);
        this.left = delayedL * this.gain; this.right = delayedR * this.gain;
    }
}

for (const margin of [1e-7, 6 / 32768 + 1e-7]) {
    const ref = new ReferencePeakLimiter(48000);
    const opt = new PeakLimiter(48000);
    for (let i = 0; i < 4000; i++) {
        const amp = (i < 900) ? 0.25 : (i < 1800) ? 1.32 : (i < 2700) ? 0.35 : 0.98;
        const l = amp * Math.sin(i * 0.13);
        const r = amp * Math.cos(i * 0.17 + 0.5);
        ref.process(l, r, margin);
        opt.process(l, r, margin);
        assert.equal(opt.left, ref.left, `left mismatch at ${i} margin=${margin}`);
        assert.equal(opt.right, ref.right, `right mismatch at ${i} margin=${margin}`);
        assert.equal(opt.gain, ref.gain, `gain mismatch at ${i} margin=${margin}`);
    }
}

// 4. PcmReader stereo polyphase resampler (44.1kHz -> 48kHz) interior fast-path check
const srcFrames = 4410;
const srcBuf = new ArrayBuffer(srcFrames * 4);
const srcView = new DataView(srcBuf);
for (let i = 0; i < srcFrames; i++) {
    srcView.setInt16(i * 4, Math.round(Math.sin((2 * Math.PI * 1000 * i) / 44100) * 16000), true);
    srcView.setInt16(i * 4 + 2, Math.round(Math.cos((2 * Math.PI * 1000 * i) / 44100) * 16000), true);
}
const pcmReader = new PcmReader(new Blob([srcBuf]), { channels: 2, sampleRate: 44100, bits: 16, blockAlign: 4, offset: 0, little: true, float: false, unsigned8: false, frames: srcFrames }, 48000);
const outStereo = await pcmReader.readFrames(0, 2400);
assert.equal(outStereo.length, 2);
assert.equal(outStereo[0].length, 2400);
assert.ok(outStereo[0].every(Number.isFinite) && outStereo[1].every(Number.isFinite));

// 5. MediaSessionController AndroidBridge notification coalescing
const calls = [];
globalThis.window = {
    location: { href: 'https://appassets.androidplatform.net/index.html' },
    AndroidBridge: {
        updateMediaNotification: (...args) => calls.push(args)
    }
};
const msc = new MediaSessionController();
store.state.isNativePlaybackActive = () => false;
msc.syncAndroidNotification({ title: 'First', artist: 'A', album: 'Alb' }, false);
msc.syncAndroidNotification({ title: 'Latest', artist: 'B', album: 'Alb2' }, true);
await Promise.resolve();
assert.equal(calls.length, 1);
assert.equal(calls[0][0], 'Latest');
assert.equal(calls[0][4], true);
window.AndroidBridge.updateMediaNotificationV2=(...args)=>calls.push(args);
msc.handlers={getDuration:()=>180,getPosition:()=>42,getPlaybackRate:()=>1.5};
msc.syncAndroidNotification({title:'Speed test'},true);await Promise.resolve();assert.equal(calls.at(-1)[7],1.5);
msc.handlers.getPlaybackRate=()=>NaN;msc.syncAndroidNotification({title:'Fallback'},true);await Promise.resolve();assert.equal(calls.at(-1)[7],1);
delete globalThis.window;

console.log('PASS UX/culling assertions, PeakLimiter bit-exact parity, stereo polyphase resample, and Android notification coalescing');
