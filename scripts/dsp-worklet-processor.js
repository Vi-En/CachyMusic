import { PeakLimiter } from './modules/peak-limiter.js';
// CachyMusic - Floating-Point DSP AudioWorklet Processor
// Signal Topology (strictly pre-dither):
//   1. 20 Hz Subsonic High-Pass Filter (Q=0.70710678 Butterworth)
//   2. Smooth Linear Gain Staging (ReplayGain * Pre-Amp Headroom * Amp Overdrive)
//   3. 10-Band RBJ Parametric EQ + Tone Shelves (Bass 95Hz, Vocal 3kHz, Treble 10kHz)
//   4. Mutually Exclusive Spatial Engine: Bauer/Meier HRTF Crossfeed OR Ambiophonics R.A.C.E.
//   5. Mid/Side Width, Mono Sum, Stereo Balance & 180-Degree Phase Polarity
//   6. Ultrasonic IMD Low-Pass Filter
//   7. Lookahead Peak Limiter / AGP with 4x peak estimation
//   8. Final xorshift32 TPDF / 2nd-Order Psychoacoustic Noise-Shaped Dither (Final stage inside the processor; external output gate may ramp)

const PEQ_FREQS = [31, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
const NUM_EQ_FILTERS = 13; // 10 PEQ + Bass (10) + Vocal (11) + Treble (12)

class CachyMusicDspProcessor extends AudioWorkletProcessor {
    constructor(options) {
        super(options);

        this.sr = (typeof sampleRate !== 'undefined') ? sampleRate : 48000;

        // DSP Feature Toggles
        this.precision64 = true;
        this.agpEnabled = false;
        this.limiterEnabled = false;
        this.subsonicEnabled = false;
        this.ultrasonicEnabled = false;
        this.ultrasonicCutoff = 32000;
        this.ditherMode = 'off';      // 'off' | 'tpdf' | 'shaped'
        this.quantizationBits = 24;
        this.crossfeedEnabled = false;
        this.ambiophonicsEnabled = false;
        this.ambiophonicsDelaySamples = Math.max(1, Math.min(32, Math.round(0.000083 * this.sr)));
        this.ambiophonicsAttenuation = 0.65;
        this.phaseInvert = false;
        this.monoMix = false;
        this.stereoWidth = 1.0;
        this.stereoBalance = 0.0;
        this.balanceGainL = 1.0;
        this.balanceGainR = 1.0;

        // Gain Staging (smoothed per-sample toward targetLinearGain)
        this.currentLinearGain = 1.0;
        this.targetLinearGain = 1.0;
        this.gainSmoothCoeff = 1.0 - Math.exp(-1.0 / (0.015 * this.sr));

        // 10-Band PEQ + Tone Shelves state
        this.peqBypassed = false;
        this.peqGains = new Float64Array(10);
        this.peqQs = new Float64Array(10);
        this.peqQs.fill(1.41);
        this.bassBoost = false;
        this.vocalBoost = false;
        this.trebleBoost = false;

        // Flat coefficient & state buffers for 13 RBJ biquads (zero GC allocation in process())
        this.eqCoeffs = new Float64Array(NUM_EQ_FILTERS * 5); // [b0, b1, b2, a1, a2]
        this.eqActive = new Uint8Array(NUM_EQ_FILTERS);
        this.activeEqIndices = new Uint8Array(NUM_EQ_FILTERS);
        this.activeEqCount = 0;
        this.eqStateL = new Float64Array(NUM_EQ_FILTERS * 4);  // [x1, x2, y1, y2]
        this.eqStateR = new Float64Array(NUM_EQ_FILTERS * 4);

        // Subsonic & Ultrasonic Biquads
        this.subL = new Float64Array(4);
        this.subR = new Float64Array(4);
        this.subCoeffs = new Float64Array(5);

        this.uL = new Float64Array(4);
        this.uR = new Float64Array(4);
        this.uCoeffs = new Float64Array(5);

        // Bauer/Meier HRTF Crossfeed (700Hz highshelf +2.85dB direct, 700Hz LP + 300us cross)
        this.xfDirectCoeffs = new Float64Array(5);
        this.xfCrossCoeffs = new Float64Array(5);
        this.xfDirectL = new Float64Array(4);
        this.xfDirectR = new Float64Array(4);
        this.xfCrossL = new Float64Array(4);
        this.xfCrossR = new Float64Array(4);
        this.xfDelaySamples = Math.max(1, Math.min(127, Math.round(0.0003 * this.sr)));
        this.xfDelayBufL = new Float64Array(128);
        this.xfDelayBufR = new Float64Array(128);
        this.xfDelayIdx = 0;

        // Ambiophonics R.A.C.E. delay buffer
        this.delayBufL = new Float64Array(64);
        this.delayBufR = new Float64Array(64);
        this.delayIdx = 0;

        // Stereo-linked lookahead limiter with 4x reconstructed peak estimation.
        this.agpCeiling = Math.pow(10, -0.6 / 20);
        this.peakLimiter = new PeakLimiter(this.sr, this.agpCeiling);
        this.lookaheadSamples = this.peakLimiter.delay;
        this.agpGain = 1.0;
        this.agpMinGainObserved = 1.0;
        this.telemetryCounter = 0;

        // Inline xorshift32 PRNG + 2nd-order noise shaping error feedback
        this.rngStateL = 0x9E3779B9 >>> 0;
        this.rngStateR = 0x85EBCA6B >>> 0;
        this.ditherErr1L = 0.0;
        this.ditherErr2L = 0.0;
        this.ditherErr1R = 0.0;
        this.ditherErr2R = 0.0;

        this.quantizationLevels = 8388608.0; // 2^23 (24-bit signed grid)
        this.invQuantization = 1.0 / this.quantizationLevels;

        this.updateSubsonicCoeffs();
        this.updateUltrasonicCoeffs();
        this.updateCrossfeedCoeffs();
        this.updateAllEqCoeffs();

        this.port.onmessage = (event) => {
            const data = event.data;
            if (!data) return;

            let needEqUpdate = false;
            const limiterWasActive = this.agpEnabled || this.limiterEnabled;

            if (typeof data.precision64 === 'boolean') this.precision64 = data.precision64;
            if (typeof data.agpEnabled === 'boolean') {
                this.agpEnabled = data.agpEnabled;
                if (!this.agpEnabled && !this.limiterEnabled) this.agpGain = 1.0;
            }
            if (typeof data.limiterEnabled === 'boolean') {
                this.limiterEnabled = data.limiterEnabled;
                if (!this.agpEnabled && !this.limiterEnabled) this.agpGain = 1.0;
            }
            if (typeof data.subsonicEnabled === 'boolean') this.subsonicEnabled = data.subsonicEnabled;
            if (typeof data.ultrasonicEnabled === 'boolean') this.ultrasonicEnabled = data.ultrasonicEnabled;
            if (Number.isFinite(data.ultrasonicCutoff)) {
                this.ultrasonicCutoff = Math.max(18000, Math.min(this.sr * 0.49, data.ultrasonicCutoff));
                this.updateUltrasonicCoeffs();
            }
            if (['off','tpdf','shaped'].includes(data.ditherMode)) this.ditherMode = data.ditherMode;
            if (data.quantizationBits === 16 || data.quantizationBits === 24) {
                this.quantizationBits = data.quantizationBits;
                this.quantizationLevels = data.quantizationBits === 16 ? 32768.0 : 8388608.0;
                this.invQuantization = 1.0 / this.quantizationLevels;
            }
            if (typeof data.linearGainTarget === 'number' && Number.isFinite(data.linearGainTarget)) {
                this.targetLinearGain = Math.max(0.0, Math.min(4.0, data.linearGainTarget));
            }
            if (typeof data.peqBypassed === 'boolean' && data.peqBypassed !== this.peqBypassed) {
                this.peqBypassed = data.peqBypassed;
                needEqUpdate = true;
            }
            if (Array.isArray(data.peqGains) && data.peqGains.length === 10) {
                for (let b = 0; b < 10; b++) {
                    const g = Number(data.peqGains[b]);
                    if (Number.isFinite(g)) {
                        const clamped = Math.max(-15, Math.min(15, g));
                        if (clamped !== this.peqGains[b]) {
                            this.peqGains[b] = clamped;
                            needEqUpdate = true;
                        }
                    }
                }
            }
            if (Array.isArray(data.peqQs) && data.peqQs.length === 10) {
                for (let b = 0; b < 10; b++) {
                    const q = Number(data.peqQs[b]);
                    if (Number.isFinite(q)) {
                        const clamped = Math.max(0.4, Math.min(8.0, q));
                        if (clamped !== this.peqQs[b]) {
                            this.peqQs[b] = clamped;
                            needEqUpdate = true;
                        }
                    }
                }
            }
            if (typeof data.bassBoost === 'boolean' && data.bassBoost !== this.bassBoost) {
                this.bassBoost = data.bassBoost;
                needEqUpdate = true;
            }
            if (typeof data.vocalBoost === 'boolean' && data.vocalBoost !== this.vocalBoost) {
                this.vocalBoost = data.vocalBoost;
                needEqUpdate = true;
            }
            if (typeof data.trebleBoost === 'boolean' && data.trebleBoost !== this.trebleBoost) {
                this.trebleBoost = data.trebleBoost;
                needEqUpdate = true;
            }
            if (typeof data.crossfeedEnabled === 'boolean') this.crossfeedEnabled = data.crossfeedEnabled;
            if (typeof data.ambiophonicsEnabled === 'boolean') this.ambiophonicsEnabled = data.ambiophonicsEnabled;
            if (Number.isFinite(data.ambiophonicsDelaySamples)) {
                this.ambiophonicsDelaySamples = Math.max(1, Math.min(32, Math.round(data.ambiophonicsDelaySamples)));
            }
            if (Number.isFinite(data.ambiophonicsAttenuation)) {
                this.ambiophonicsAttenuation = Math.max(0.1, Math.min(0.95, data.ambiophonicsAttenuation));
            }
            if (typeof data.phaseInvert === 'boolean') this.phaseInvert = data.phaseInvert;
            if (typeof data.monoMix === 'boolean') this.monoMix = data.monoMix;
            if (typeof data.stereoWidth === 'number' && !isNaN(data.stereoWidth)) {
                this.stereoWidth = Math.max(0.0, Math.min(2.0, data.stereoWidth));
            }
            if (typeof data.stereoBalance === 'number' && !isNaN(data.stereoBalance)) {
                this.stereoBalance = Math.max(-1.0, Math.min(1.0, data.stereoBalance));
                this.updateBalanceGains();
            }

            if (limiterWasActive !== (this.agpEnabled || this.limiterEnabled)) {
                this.peakLimiter.reset(); this.agpGain = 1; this.agpMinGainObserved = 1;
            }
            if (needEqUpdate) {
                this.updateAllEqCoeffs();
            }

            this.port.postMessage({
                type: 'status',
                revision: data.revision,
                precision64: this.precision64,
                agpEnabled: this.agpEnabled,
                limiterEnabled: this.limiterEnabled,
                subsonicEnabled: this.subsonicEnabled,
                ultrasonicEnabled: this.ultrasonicEnabled,
                ultrasonicCutoff: this.ultrasonicCutoff,
                ditherMode: this.ditherMode,
                crossfeedEnabled: this.crossfeedEnabled,
                ambiophonicsEnabled: this.ambiophonicsEnabled,
                phaseInvert: this.phaseInvert,
                monoMix: this.monoMix,
                stereoWidth: this.stereoWidth,
                stereoBalance: this.stereoBalance,
                sampleRate: this.sr
            });
        };
    }

    updateBalanceGains() {
        const bal = this.stereoBalance;
        if (Math.abs(bal) < 0.001) {
            this.balanceGainL = 1.0;
            this.balanceGainR = 1.0;
        } else if (bal < 0) {
            this.balanceGainL = 1.0;
            this.balanceGainR = Math.cos((-bal) * Math.PI * 0.5);
        } else {
            this.balanceGainL = Math.cos(bal * Math.PI * 0.5);
            this.balanceGainR = 1.0;
        }
    }

    computeRbjBiquad(targetArr, baseIdx, type, freq, Q, gainDb) {
        const f0 = Math.min(freq, this.sr * 0.45);
        const w0 = (2.0 * Math.PI * f0) / this.sr;
        const cosw = Math.cos(w0);
        const sinw = Math.sin(w0);
        const A = Math.pow(10.0, gainDb / 40.0);

        let b0 = 1.0, b1 = 0.0, b2 = 0.0, a0 = 1.0, a1 = 0.0, a2 = 0.0;
        if (type === 'peaking') {
            const alpha = sinw / (2.0 * Math.max(0.1, Q));
            b0 = 1.0 + alpha * A;
            b1 = -2.0 * cosw;
            b2 = 1.0 - alpha * A;
            a0 = 1.0 + alpha / A;
            a1 = -2.0 * cosw;
            a2 = 1.0 - alpha / A;
        } else if (type === 'lowshelf') {
            const S = 1.0;
            const alpha = (sinw * 0.5) * Math.sqrt((A + 1.0 / A) * (1.0 / S - 1.0) + 2.0);
            const twoSqrtAAlpha = 2.0 * Math.sqrt(A) * alpha;
            b0 = A * ((A + 1.0) - (A - 1.0) * cosw + twoSqrtAAlpha);
            b1 = 2.0 * A * ((A - 1.0) - (A + 1.0) * cosw);
            b2 = A * ((A + 1.0) - (A - 1.0) * cosw - twoSqrtAAlpha);
            a0 = (A + 1.0) + (A - 1.0) * cosw + twoSqrtAAlpha;
            a1 = -2.0 * ((A - 1.0) + (A + 1.0) * cosw);
            a2 = (A + 1.0) + (A - 1.0) * cosw - twoSqrtAAlpha;
        } else if (type === 'highshelf') {
            const S = 1.0;
            const alpha = (sinw * 0.5) * Math.sqrt((A + 1.0 / A) * (1.0 / S - 1.0) + 2.0);
            const twoSqrtAAlpha = 2.0 * Math.sqrt(A) * alpha;
            b0 = A * ((A + 1.0) + (A - 1.0) * cosw + twoSqrtAAlpha);
            b1 = -2.0 * A * ((A - 1.0) + (A + 1.0) * cosw);
            b2 = A * ((A + 1.0) + (A - 1.0) * cosw - twoSqrtAAlpha);
            a0 = (A + 1.0) - (A - 1.0) * cosw + twoSqrtAAlpha;
            a1 = 2.0 * ((A - 1.0) - (A + 1.0) * cosw);
            a2 = (A + 1.0) - (A - 1.0) * cosw - twoSqrtAAlpha;
        } else if (type === 'lowpass') {
            const alpha = sinw / (2.0 * Q);
            b0 = (1.0 - cosw) * 0.5;
            b1 = 1.0 - cosw;
            b2 = (1.0 - cosw) * 0.5;
            a0 = 1.0 + alpha;
            a1 = -2.0 * cosw;
            a2 = 1.0 - alpha;
        }

        const invA0 = 1.0 / a0;
        targetArr[baseIdx] = b0 * invA0;
        targetArr[baseIdx + 1] = b1 * invA0;
        targetArr[baseIdx + 2] = b2 * invA0;
        targetArr[baseIdx + 3] = a1 * invA0;
        targetArr[baseIdx + 4] = a2 * invA0;
    }

    updateAllEqCoeffs() {
        for (let i = 0; i < 10; i++) {
            const gain = this.peqBypassed ? 0.0 : this.peqGains[i];
            if (Math.abs(gain) < 0.01) {
                this.eqActive[i] = 0;
            } else {
                this.eqActive[i] = 1;
                const type = i === 0 ? 'lowshelf' : (i === 9 ? 'highshelf' : 'peaking');
                this.computeRbjBiquad(this.eqCoeffs, i * 5, type, PEQ_FREQS[i], this.peqQs[i], gain);
            }
        }
        // Tone filters matching Studio DSP Graph
        this.eqActive[10] = this.bassBoost ? 1 : 0;
        if (this.bassBoost) this.computeRbjBiquad(this.eqCoeffs, 10 * 5, 'lowshelf', 95.0, 0.707, 3.8);

        this.eqActive[11] = this.vocalBoost ? 1 : 0;
        if (this.vocalBoost) this.computeRbjBiquad(this.eqCoeffs, 11 * 5, 'peaking', 3000.0, 1.2, 2.8);

        this.eqActive[12] = this.trebleBoost ? 1 : 0;
        if (this.trebleBoost) this.computeRbjBiquad(this.eqCoeffs, 12 * 5, 'highshelf', 10000.0, 0.707, 3.0);

        // Rebuild only when settings change; the sample loop visits active filters.
        this.activeEqCount = 0;
        for (let i = 0; i < NUM_EQ_FILTERS; i++) {
            if (this.eqActive[i]) this.activeEqIndices[this.activeEqCount++] = i;
        }
    }

    updateSubsonicCoeffs() {
        const omega = (2.0 * Math.PI * 20.0) / this.sr;
        const cosw = Math.cos(omega);
        const sinw = Math.sin(omega);
        const alpha = sinw / (2.0 * 0.7071067811865475);
        const invA0 = 1.0 / (1.0 + alpha);

        this.subCoeffs[0] = ((1.0 + cosw) * 0.5) * invA0;
        this.subCoeffs[1] = -(1.0 + cosw) * invA0;
        this.subCoeffs[2] = ((1.0 + cosw) * 0.5) * invA0;
        this.subCoeffs[3] = (-2.0 * cosw) * invA0;
        this.subCoeffs[4] = (1.0 - alpha) * invA0;
    }

    updateUltrasonicCoeffs() {
        const nyquist = this.sr * 0.5;
        if (this.ultrasonicCutoff >= nyquist * 0.95) {
            this.uCoeffs[0] = 1.0;
            this.uCoeffs[1] = 0.0;
            this.uCoeffs[2] = 0.0;
            this.uCoeffs[3] = 0.0;
            this.uCoeffs[4] = 0.0;
            return;
        }
        const targetCutoff = Math.max(2000.0, Math.min(this.ultrasonicCutoff, nyquist * 0.95));
        this.computeRbjBiquad(this.uCoeffs, 0, 'lowpass', targetCutoff, 0.7071067811865475, 0.0);
    }

    updateCrossfeedCoeffs() {
        // Direct high-shelf (+2.85 dB above 700 Hz) + Cross low-pass (700 Hz, Q=0.707)
        this.computeRbjBiquad(this.xfDirectCoeffs, 0, 'highshelf', 700.0, 0.707, 2.85);
        this.computeRbjBiquad(this.xfCrossCoeffs, 0, 'lowpass', 700.0, 0.7071067811865475, 0.0);
    }

    process(inputs, outputs) {
        const input = inputs[0];
        const output = outputs[0];
        if (!input || input.length === 0 || !output || output.length === 0) {
            return true;
        }

        const inL = input[0];
        const inR = input[1] || input[0];
        const outL = output[0];
        const outR = output[1] || output[0];
        const numSamples = inL.length;

        const p64 = this.precision64;
        const useSubsonic = this.subsonicEnabled;
        const useUltrasonic = this.ultrasonicEnabled && this.ultrasonicCutoff < this.sr * 0.475;
        // Mutually exclusive: Bauer Crossfeed takes priority over Ambiophonics R.A.C.E. if both enabled
        const useCrossfeed = this.crossfeedEnabled;
        const useAmbi = !useCrossfeed && this.ambiophonicsEnabled;
        const useLimiter = this.agpEnabled || this.limiterEnabled;
        const dither = this.ditherMode;
        const invPhase = this.phaseInvert;
        const isMono = this.monoMix;
        const width = this.stereoWidth;
        const balL = this.balanceGainL;
        const balR = this.balanceGainR;

        const sb0 = this.subCoeffs[0], sb1 = this.subCoeffs[1], sb2 = this.subCoeffs[2];
        const sa1 = this.subCoeffs[3], sa2 = this.subCoeffs[4];
        const ub0 = this.uCoeffs[0], ub1 = this.uCoeffs[1], ub2 = this.uCoeffs[2];
        const ua1 = this.uCoeffs[3], ua2 = this.uCoeffs[4];
        const xfd0 = this.xfDirectCoeffs[0], xfd1 = this.xfDirectCoeffs[1], xfd2 = this.xfDirectCoeffs[2], xfda1 = this.xfDirectCoeffs[3], xfda2 = this.xfDirectCoeffs[4];
        const xfc0 = this.xfCrossCoeffs[0], xfc1 = this.xfCrossCoeffs[1], xfc2 = this.xfCrossCoeffs[2], xfca1 = this.xfCrossCoeffs[3], xfca2 = this.xfCrossCoeffs[4];

        const delay = this.ambiophonicsDelaySamples;
        const atten = this.ambiophonicsAttenuation;
        const maxD = this.delayBufL.length;
        const delayMask = maxD - 1;
        const xfDelay = this.xfDelaySamples;
        const xfMax = this.xfDelayBufL.length;
        const xfMask = xfMax - 1;
        const inv32Max = 1.0 / 4294967296.0;
        const needWidth = !isMono && Math.abs(width - 1.0) > 0.005;
        const needBalance = balL !== 1.0 || balR !== 1.0;

        const targetGain = this.targetLinearGain;
        let curGain = this.currentLinearGain;
        const gainSmooth = this.gainSmoothCoeff;
        const unityGain = curGain === targetGain && curGain === 1.0;

        const subL = this.subL, subR = this.subR;
        const eqCoeffs = this.eqCoeffs, eqStateL = this.eqStateL, eqStateR = this.eqStateR;
        const uL = this.uL, uR = this.uR;
        const xfDirectL = this.xfDirectL, xfDirectR = this.xfDirectR;
        const xfCrossL = this.xfCrossL, xfCrossR = this.xfCrossR;
        const xfDelayBufL = this.xfDelayBufL, xfDelayBufR = this.xfDelayBufR;
        const delayBufL = this.delayBufL, delayBufR = this.delayBufR;
        const limiter = this.peakLimiter;
        const qLevels = this.quantizationLevels;
        const invQ = this.invQuantization;

        if (!useSubsonic && this.activeEqCount === 0 && !useCrossfeed && !useAmbi && !isMono
            && !needWidth && !needBalance && !invPhase && !useUltrasonic && !useLimiter
            && dither === 'off' && unityGain) {
            for (let i = 0; i < numSamples; i++) {
                let sL = p64 ? inL[i] : Math.fround(inL[i]);
                let sR = p64 ? inR[i] : Math.fround(inR[i]);
                if (!Number.isFinite(sL) || !Number.isFinite(sR)) {
                    sL = 0.0;
                    sR = 0.0;
                    subL.fill(0); subR.fill(0);
                    uL.fill(0); uR.fill(0);
                    eqStateL.fill(0); eqStateR.fill(0);
                    xfDirectL.fill(0); xfDirectR.fill(0);
                    xfCrossL.fill(0); xfCrossR.fill(0);
                    limiter.reset();
                    this.ditherErr1L = 0.0; this.ditherErr2L = 0.0;
                    this.ditherErr1R = 0.0; this.ditherErr2R = 0.0;
                    this.agpGain = 1.0;
                }
                outL[i] = sL;
                outR[i] = sR;
            }
            if (++this.telemetryCounter >= 75) {
                this.telemetryCounter = 0;
                const grDb = this.agpMinGainObserved < 0.999 ? (20.0 * Math.log10(this.agpMinGainObserved)) : 0.0;
                this.agpMinGainObserved = this.agpGain;
                if (grDb < -0.05) {
                    this.port.postMessage({ type: 'agp_telemetry', gainReductionDb: grDb });
                }
            }
            return true;
        }

        const limiterMargin = dither === 'off' ? 1e-7 : 6 * invQ + 1e-7;
        const shapedMaxErr = invQ * 2.0;
        let xfIdx = this.xfDelayIdx;
        let ambiIdx = this.delayIdx;

        for (let i = 0; i < numSamples; i++) {
            let sL = p64 ? inL[i] : Math.fround(inL[i]);
            let sR = p64 ? inR[i] : Math.fround(inR[i]);

            // 1. 20 Hz Subsonic High-Pass Filter (optional DC/rumble removal before EQ)
            if (useSubsonic) {
                let ySubL = sb0 * sL + sb1 * subL[0] + sb2 * subL[1] - sa1 * subL[2] - sa2 * subL[3];
                let ySubR = sb0 * sR + sb1 * subR[0] + sb2 * subR[1] - sa1 * subR[2] - sa2 * subR[3];
                if (!p64) { ySubL = Math.fround(ySubL); ySubR = Math.fround(ySubR); }
                subL[1] = subL[0]; subL[0] = sL; subL[3] = subL[2]; subL[2] = ySubL;
                subR[1] = subR[0]; subR[0] = sR; subR[3] = subR[2]; subR[2] = ySubR;
                sL = ySubL;
                sR = ySubR;
            }

            // 2. Smooth Linear Gain Staging (ReplayGain * Pre-Amp * Master Amp)
            curGain += (targetGain - curGain) * gainSmooth;
            sL *= curGain;
            sR *= curGain;

            // 3. 10-Band RBJ Parametric EQ + Bass / Vocal / Treble Tone Shelves
            for (let active = 0; active < this.activeEqCount; active++) {
                const f = this.activeEqIndices[active];
                const cBase = f * 5;
                const sBase = f * 4;
                const b0 = eqCoeffs[cBase], b1 = eqCoeffs[cBase + 1], b2 = eqCoeffs[cBase + 2];
                const a1 = eqCoeffs[cBase + 3], a2 = eqCoeffs[cBase + 4];

                let yL = b0 * sL + b1 * eqStateL[sBase] + b2 * eqStateL[sBase + 1] - a1 * eqStateL[sBase + 2] - a2 * eqStateL[sBase + 3];
                let yR = b0 * sR + b1 * eqStateR[sBase] + b2 * eqStateR[sBase + 1] - a1 * eqStateR[sBase + 2] - a2 * eqStateR[sBase + 3];
                if (!p64) { yL = Math.fround(yL); yR = Math.fround(yR); }
                eqStateL[sBase + 1] = eqStateL[sBase]; eqStateL[sBase] = sL;
                eqStateL[sBase + 3] = eqStateL[sBase + 2]; eqStateL[sBase + 2] = yL;
                eqStateR[sBase + 1] = eqStateR[sBase]; eqStateR[sBase] = sR;
                eqStateR[sBase + 3] = eqStateR[sBase + 2]; eqStateR[sBase + 2] = yR;
                sL = yL;
                sR = yR;
            }

            // 4. Spatial Processing (Bauer/Meier Headphone Crossfeed OR Speaker R.A.C.E.)
            if (useCrossfeed) {
                const dL = xfd0 * sL + xfd1 * xfDirectL[0] + xfd2 * xfDirectL[1] - xfda1 * xfDirectL[2] - xfda2 * xfDirectL[3];
                const dR = xfd0 * sR + xfd1 * xfDirectR[0] + xfd2 * xfDirectR[1] - xfda1 * xfDirectR[2] - xfda2 * xfDirectR[3];
                xfDirectL[1] = xfDirectL[0]; xfDirectL[0] = sL; xfDirectL[3] = xfDirectL[2]; xfDirectL[2] = dL;
                xfDirectR[1] = xfDirectR[0]; xfDirectR[0] = sR; xfDirectR[3] = xfDirectR[2]; xfDirectR[2] = dR;

                const cL = xfc0 * sL + xfc1 * xfCrossL[0] + xfc2 * xfCrossL[1] - xfca1 * xfCrossL[2] - xfca2 * xfCrossL[3];
                const cR = xfc0 * sR + xfc1 * xfCrossR[0] + xfc2 * xfCrossR[1] - xfca1 * xfCrossR[2] - xfca2 * xfCrossR[3];
                xfCrossL[1] = xfCrossL[0]; xfCrossL[0] = sL; xfCrossL[3] = xfCrossL[2]; xfCrossL[2] = cL;
                xfCrossR[1] = xfCrossR[0]; xfCrossR[0] = sR; xfCrossR[3] = xfCrossR[2]; xfCrossR[2] = cR;

                xfDelayBufL[xfIdx] = cL;
                xfDelayBufR[xfIdx] = cR;
                const readIdx = (xfIdx - xfDelay + xfMax) & xfMask;
                const delayedCrossR = xfDelayBufR[readIdx];
                const delayedCrossL = xfDelayBufL[readIdx];
                xfIdx = (xfIdx + 1) & xfMask;

                sL = (dL * 0.72) + (delayedCrossR * 0.28);
                sR = (dR * 0.72) + (delayedCrossL * 0.28);
            } else if (useAmbi) {
                const readIdx = (ambiIdx - delay + maxD) & delayMask;
                const delayedL = delayBufL[readIdx];
                const delayedR = delayBufR[readIdx];
                const canceledL = sL - (atten * delayedR);
                const canceledR = sR - (atten * delayedL);
                delayBufL[ambiIdx] = canceledL;
                delayBufR[ambiIdx] = canceledR;
                ambiIdx = (ambiIdx + 1) & delayMask;
                sL = canceledL;
                sR = canceledR;
            }

            // 5. Mid/Side Width, Mono Mix, Balance & 180-Degree Phase Polarity
            if (isMono) {
                const mono = (sL + sR) * 0.5;
                sL = mono;
                sR = mono;
            } else if (needWidth) {
                const mid = (sL + sR) * 0.5;
                const side = (sL - sR) * 0.5 * width;
                sL = mid + side;
                sR = mid - side;
            }
            if (needBalance) {
                sL *= balL;
                sR *= balR;
            }
            if (invPhase) {
                sL = -sL;
                sR = -sR;
            }

            // 6. Ultrasonic IMD Low-Pass Filter
            if (useUltrasonic) {
                let yUL = ub0 * sL + ub1 * uL[0] + ub2 * uL[1] - ua1 * uL[2] - ua2 * uL[3];
                let yUR = ub0 * sR + ub1 * uR[0] + ub2 * uR[1] - ua1 * uR[2] - ua2 * uR[3];
                if (!p64) { yUL = Math.fround(yUL); yUR = Math.fround(yUR); }
                uL[1] = uL[0]; uL[0] = sL; uL[3] = uL[2]; uL[2] = yUL;
                uR[1] = uR[0]; uR[0] = sR; uR[3] = uR[2]; uR[2] = yUR;
                sL = yUL;
                sR = yUR;
            }

            // Non-Finite Protection BEFORE Lookahead Limiter & Dither
            if (!Number.isFinite(sL) || !Number.isFinite(sR)) {
                sL = 0.0;
                sR = 0.0;
                subL.fill(0); subR.fill(0);
                uL.fill(0); uR.fill(0);
                eqStateL.fill(0); eqStateR.fill(0);
                xfDirectL.fill(0); xfDirectR.fill(0);
                xfCrossL.fill(0); xfCrossR.fill(0);
                limiter.reset();
                this.ditherErr1L = 0.0; this.ditherErr2L = 0.0;
                this.ditherErr1R = 0.0; this.ditherErr2R = 0.0;
                this.agpGain = 1.0;
            }

            // 7. Lookahead, stereo-linked peak limiting (no nonlinear soft clipping).
            if (useLimiter) {
                limiter.process(sL, sR, limiterMargin);
                sL = limiter.left;
                sR = limiter.right;
                this.agpGain = limiter.gain;
                if (this.agpGain < this.agpMinGainObserved) this.agpMinGainObserved = this.agpGain;
            }

            // 8. Final Stage: Inline xorshift32 TPDF / 2nd-Order Psychoacoustic Noise-Shaped Dither
            // Final processing stage here; the external output gate can attenuate during transitions.
            if (dither !== 'off') {
                let xL = this.rngStateL;
                xL ^= xL << 13; xL ^= xL >>> 17; xL ^= xL << 5;
                const r1L = (xL >>> 0) * inv32Max - 0.5;
                xL ^= xL << 13; xL ^= xL >>> 17; xL ^= xL << 5;
                const r2L = (xL >>> 0) * inv32Max - 0.5;
                this.rngStateL = xL >>> 0;
                const tpdfL = (r1L - r2L) * invQ;

                let xR = this.rngStateR;
                xR ^= xR << 13; xR ^= xR >>> 17; xR ^= xR << 5;
                const r1R = (xR >>> 0) * inv32Max - 0.5;
                xR ^= xR << 13; xR ^= xR >>> 17; xR ^= xR << 5;
                const r2R = (xR >>> 0) * inv32Max - 0.5;
                this.rngStateR = xR >>> 0;
                const tpdfR = (r1R - r2R) * invQ;

                if (dither === 'shaped') {
                    const shapedL = sL + tpdfL - (1.5 * this.ditherErr1L) + (0.65 * this.ditherErr2L);
                    const quantL = Math.round(shapedL * qLevels) * invQ;
                    let errL = quantL - shapedL;
                    if (!Number.isFinite(errL)) errL = 0.0;
                    else if (errL > shapedMaxErr) errL = shapedMaxErr;
                    else if (errL < -shapedMaxErr) errL = -shapedMaxErr;
                    this.ditherErr2L = this.ditherErr1L;
                    this.ditherErr1L = errL;
                    sL = quantL;

                    const shapedR = sR + tpdfR - (1.5 * this.ditherErr1R) + (0.65 * this.ditherErr2R);
                    const quantR = Math.round(shapedR * qLevels) * invQ;
                    let errR = quantR - shapedR;
                    if (!Number.isFinite(errR)) errR = 0.0;
                    else if (errR > shapedMaxErr) errR = shapedMaxErr;
                    else if (errR < -shapedMaxErr) errR = -shapedMaxErr;
                    this.ditherErr2R = this.ditherErr1R;
                    this.ditherErr1R = errR;
                    sR = quantR;
                } else {
                    sL = Math.round((sL + tpdfL) * qLevels) * invQ;
                    sR = Math.round((sR + tpdfR) * qLevels) * invQ;
                }
            }

            outL[i] = sL;
            outR[i] = sR;
        }
        this.currentLinearGain = curGain;
        this.xfDelayIdx = xfIdx;
        this.delayIdx = ambiIdx;

        // Periodic AGP telemetry (~5Hz at 48kHz / 128-sample quantum)
        this.telemetryCounter++;
        if (this.telemetryCounter >= 75) {
            this.telemetryCounter = 0;
            const grDb = this.agpMinGainObserved < 0.999 ? (20.0 * Math.log10(this.agpMinGainObserved)) : 0.0;
            this.agpMinGainObserved = this.agpGain;
            if (grDb < -0.05) {
                this.port.postMessage({
                    type: 'agp_telemetry',
                    gainReductionDb: grDb
                });
            }
        }

        return true;
    }
}

registerProcessor('cachymusic-dsp-processor', CachyMusicDspProcessor);
