// CachyMusic - Studio-Grade True 64-Bit Floating Point DSP AudioWorklet Processor
// Signal Topology (strictly pre-dither):
//   1. 20 Hz Subsonic High-Pass Filter (Q=0.70710678 Butterworth)
//   2. Smooth Linear Gain Staging (ReplayGain * Pre-Amp Headroom * Amp Overdrive)
//   3. 10-Band RBJ Parametric EQ + Tone Shelves (Bass 95Hz, Vocal 3kHz, Treble 10kHz)
//   4. Mutually Exclusive Spatial Engine: Bauer/Meier HRTF Crossfeed OR Ambiophonics R.A.C.E.
//   5. Mid/Side Width, Mono Sum, Stereo Balance & 180-Degree Phase Polarity
//   6. Ultrasonic IMD Low-Pass Filter
//   7. 1.5 ms Lookahead Peak Limiter / AGP & Pre-Dither Soft-Clip Safety Guard
//   8. Final xorshift32 TPDF / 2nd-Order Psychoacoustic Noise-Shaped Dither (Zero ops downstream)

const PEQ_FREQS = [31, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
const NUM_EQ_FILTERS = 13; // 10 PEQ + Bass (10) + Vocal (11) + Treble (12)

class CachyMusicDspProcessor extends AudioWorkletProcessor {
    constructor(options) {
        super(options);

        this.sr = (typeof sampleRate !== 'undefined') ? sampleRate : 48000;

        // DSP Feature Toggles
        this.precision64 = true;
        this.agpEnabled = true;
        this.limiterEnabled = false;
        this.subsonicEnabled = true;
        this.ultrasonicEnabled = true;
        this.ultrasonicCutoff = 32000;
        this.ditherMode = 'shaped';      // 'off' | 'tpdf' | 'shaped'
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

        // 1.5 ms Lookahead Peak Limiter + AGP Ring Buffer
        this.lookaheadSamples = Math.max(16, Math.min(511, Math.round(0.0015 * this.sr)));
        this.laBufL = new Float64Array(512);
        this.laBufR = new Float64Array(512);
        this.laWriteIdx = 0;
        this.laAttackCoeff = 1.0 - Math.exp(-1.0 / (0.0005 * this.sr)); // 0.5 ms fast transient arrest
        this.laReleaseCoeff = 1.0 - Math.exp(-1.0 / (0.090 * this.sr)); // 90 ms transparent release
        this.agpGain = 1.0;
        this.agpCeiling = 0.96605; // -0.30 dBFS true-peak safe headroom
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
            if (typeof data.ultrasonicCutoff === 'number') {
                this.ultrasonicCutoff = Math.max(18000, Math.min(this.sr * 0.49, data.ultrasonicCutoff));
                this.updateUltrasonicCoeffs();
            }
            if (typeof data.ditherMode === 'string') this.ditherMode = data.ditherMode;
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
                    if (Number.isFinite(g)) this.peqGains[b] = Math.max(-15, Math.min(15, g));
                }
                needEqUpdate = true;
            }
            if (Array.isArray(data.peqQs) && data.peqQs.length === 10) {
                for (let b = 0; b < 10; b++) {
                    const q = Number(data.peqQs[b]);
                    if (Number.isFinite(q)) this.peqQs[b] = Math.max(0.4, Math.min(8.0, q));
                }
                needEqUpdate = true;
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
            if (typeof data.ambiophonicsDelaySamples === 'number') {
                this.ambiophonicsDelaySamples = Math.max(1, Math.min(32, Math.round(data.ambiophonicsDelaySamples)));
            }
            if (typeof data.ambiophonicsAttenuation === 'number') {
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

            if (needEqUpdate) {
                this.updateAllEqCoeffs();
            }

            this.port.postMessage({
                type: 'status',
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
        const useUltrasonic = this.ultrasonicEnabled;
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
        const xfDelay = this.xfDelaySamples;
        const xfMax = this.xfDelayBufL.length;
        const laLen = this.laBufL.length;
        const laDelay = this.lookaheadSamples;
        const inv32Max = 1.0 / 4294967296.0;

        for (let i = 0; i < numSamples; i++) {
            let sL = p64 ? inL[i] : Math.fround(inL[i]);
            let sR = p64 ? inR[i] : Math.fround(inR[i]);

            // 1. 20 Hz Subsonic High-Pass Filter (mandatory DC/rumble removal before EQ)
            if (useSubsonic) {
                let ySubL = sb0 * sL + sb1 * this.subL[0] + sb2 * this.subL[1] - sa1 * this.subL[2] - sa2 * this.subL[3];
                let ySubR = sb0 * sR + sb1 * this.subR[0] + sb2 * this.subR[1] - sa1 * this.subR[2] - sa2 * this.subR[3];
                if (!p64) { ySubL = Math.fround(ySubL); ySubR = Math.fround(ySubR); }
                this.subL[1] = this.subL[0]; this.subL[0] = sL; this.subL[3] = this.subL[2]; this.subL[2] = ySubL;
                this.subR[1] = this.subR[0]; this.subR[0] = sR; this.subR[3] = this.subR[2]; this.subR[2] = ySubR;
                sL = ySubL;
                sR = ySubR;
            }

            // 2. Smooth Linear Gain Staging (ReplayGain * Pre-Amp * Master Amp)
            this.currentLinearGain += (this.targetLinearGain - this.currentLinearGain) * this.gainSmoothCoeff;
            sL *= this.currentLinearGain;
            sR *= this.currentLinearGain;

            // 3. 10-Band RBJ Parametric EQ + Bass / Vocal / Treble Tone Shelves
            for (let f = 0; f < NUM_EQ_FILTERS; f++) {
                if (!this.eqActive[f]) continue;
                const cBase = f * 5;
                const sBase = f * 4;
                const b0 = this.eqCoeffs[cBase], b1 = this.eqCoeffs[cBase + 1], b2 = this.eqCoeffs[cBase + 2];
                const a1 = this.eqCoeffs[cBase + 3], a2 = this.eqCoeffs[cBase + 4];

                let yL = b0 * sL + b1 * this.eqStateL[sBase] + b2 * this.eqStateL[sBase + 1] - a1 * this.eqStateL[sBase + 2] - a2 * this.eqStateL[sBase + 3];
                let yR = b0 * sR + b1 * this.eqStateR[sBase] + b2 * this.eqStateR[sBase + 1] - a1 * this.eqStateR[sBase + 2] - a2 * this.eqStateR[sBase + 3];
                if (!p64) { yL = Math.fround(yL); yR = Math.fround(yR); }
                this.eqStateL[sBase + 1] = this.eqStateL[sBase]; this.eqStateL[sBase] = sL;
                this.eqStateL[sBase + 3] = this.eqStateL[sBase + 2]; this.eqStateL[sBase + 2] = yL;
                this.eqStateR[sBase + 1] = this.eqStateR[sBase]; this.eqStateR[sBase] = sR;
                this.eqStateR[sBase + 3] = this.eqStateR[sBase + 2]; this.eqStateR[sBase + 2] = yR;
                sL = yL;
                sR = yR;
            }

            // 4. Spatial Processing (Bauer/Meier Headphone Crossfeed OR Speaker R.A.C.E.)
            if (useCrossfeed) {
                const dL = xfd0 * sL + xfd1 * this.xfDirectL[0] + xfd2 * this.xfDirectL[1] - xfda1 * this.xfDirectL[2] - xfda2 * this.xfDirectL[3];
                const dR = xfd0 * sR + xfd1 * this.xfDirectR[0] + xfd2 * this.xfDirectR[1] - xfda1 * this.xfDirectR[2] - xfda2 * this.xfDirectR[3];
                this.xfDirectL[1] = this.xfDirectL[0]; this.xfDirectL[0] = sL; this.xfDirectL[3] = this.xfDirectL[2]; this.xfDirectL[2] = dL;
                this.xfDirectR[1] = this.xfDirectR[0]; this.xfDirectR[0] = sR; this.xfDirectR[3] = this.xfDirectR[2]; this.xfDirectR[2] = dR;

                const cL = xfc0 * sL + xfc1 * this.xfCrossL[0] + xfc2 * this.xfCrossL[1] - xfca1 * this.xfCrossL[2] - xfca2 * this.xfCrossL[3];
                const cR = xfc0 * sR + xfc1 * this.xfCrossR[0] + xfc2 * this.xfCrossR[1] - xfca1 * this.xfCrossR[2] - xfca2 * this.xfCrossR[3];
                this.xfCrossL[1] = this.xfCrossL[0]; this.xfCrossL[0] = sL; this.xfCrossL[3] = this.xfCrossL[2]; this.xfCrossL[2] = cL;
                this.xfCrossR[1] = this.xfCrossR[0]; this.xfCrossR[0] = sR; this.xfCrossR[3] = this.xfCrossR[2]; this.xfCrossR[2] = cR;

                this.xfDelayBufL[this.xfDelayIdx] = cL;
                this.xfDelayBufR[this.xfDelayIdx] = cR;
                const readIdx = (this.xfDelayIdx - xfDelay + xfMax) % xfMax;
                const delayedCrossR = this.xfDelayBufR[readIdx];
                const delayedCrossL = this.xfDelayBufL[readIdx];
                this.xfDelayIdx = (this.xfDelayIdx + 1) % xfMax;

                sL = (dL * 0.72) + (delayedCrossR * 0.28);
                sR = (dR * 0.72) + (delayedCrossL * 0.28);
            } else if (useAmbi) {
                const readIdx = (this.delayIdx - delay + maxD) % maxD;
                const delayedL = this.delayBufL[readIdx];
                const delayedR = this.delayBufR[readIdx];
                const canceledL = sL - (atten * delayedR);
                const canceledR = sR - (atten * delayedL);
                this.delayBufL[this.delayIdx] = canceledL;
                this.delayBufR[this.delayIdx] = canceledR;
                this.delayIdx = (this.delayIdx + 1) % maxD;
                sL = canceledL;
                sR = canceledR;
            }

            // 5. Mid/Side Width, Mono Mix, Balance & 180-Degree Phase Polarity
            if (isMono) {
                const mono = (sL + sR) * 0.5;
                sL = mono;
                sR = mono;
            } else if (Math.abs(width - 1.0) > 0.005) {
                const mid = (sL + sR) * 0.5;
                const side = (sL - sR) * 0.5 * width;
                sL = mid + side;
                sR = mid - side;
            }
            if (balL !== 1.0 || balR !== 1.0) {
                sL *= balL;
                sR *= balR;
            }
            if (invPhase) {
                sL = -sL;
                sR = -sR;
            }

            // 6. Ultrasonic IMD Low-Pass Filter
            if (useUltrasonic) {
                let yUL = ub0 * sL + ub1 * this.uL[0] + ub2 * this.uL[1] - ua1 * this.uL[2] - ua2 * this.uL[3];
                let yUR = ub0 * sR + ub1 * this.uR[0] + ub2 * this.uR[1] - ua1 * this.uR[2] - ua2 * this.uR[3];
                if (!p64) { yUL = Math.fround(yUL); yUR = Math.fround(yUR); }
                this.uL[1] = this.uL[0]; this.uL[0] = sL; this.uL[3] = this.uL[2]; this.uL[2] = yUL;
                this.uR[1] = this.uR[0]; this.uR[0] = sR; this.uR[3] = this.uR[2]; this.uR[2] = yUR;
                sL = yUL;
                sR = yUR;
            }

            // Non-Finite Protection BEFORE Lookahead Limiter & Dither
            if (!Number.isFinite(sL) || !Number.isFinite(sR)) {
                sL = 0.0;
                sR = 0.0;
                this.subL.fill(0); this.subR.fill(0);
                this.uL.fill(0); this.uR.fill(0);
                this.eqStateL.fill(0); this.eqStateR.fill(0);
                this.xfDirectL.fill(0); this.xfDirectR.fill(0);
                this.xfCrossL.fill(0); this.xfCrossR.fill(0);
                this.laBufL.fill(0); this.laBufR.fill(0);
                this.ditherErr1L = 0.0; this.ditherErr2L = 0.0;
                this.ditherErr1R = 0.0; this.ditherErr2R = 0.0;
                this.agpGain = 1.0;
            }

            // 7. 1.5 ms Lookahead Peak Limiter + AGP & Pre-Dither Soft-Clip Safety Guard
            if (useLimiter) {
                this.laBufL[this.laWriteIdx] = sL;
                this.laBufR[this.laWriteIdx] = sR;
                const readIdx = (this.laWriteIdx - laDelay + laLen) % laLen;
                const delayedL = this.laBufL[readIdx];
                const delayedR = this.laBufR[readIdx];
                this.laWriteIdx = (this.laWriteIdx + 1) % laLen;

                const futAbsL = sL < 0 ? -sL : sL;
                const futAbsR = sR < 0 ? -sR : sR;
                const delAbsL = delayedL < 0 ? -delayedL : delayedL;
                const delAbsR = delayedR < 0 ? -delayedR : delayedR;
                const peak = Math.max(futAbsL, futAbsR, delAbsL, delAbsR);

                const targetGain = (peak * this.agpGain > this.agpCeiling && peak > 0.0001)
                    ? (this.agpCeiling / peak)
                    : 1.0;

                if (targetGain < this.agpGain) {
                    this.agpGain += (targetGain - this.agpGain) * this.laAttackCoeff;
                } else {
                    this.agpGain += (1.0 - this.agpGain) * this.laReleaseCoeff;
                }
                if (this.agpGain < this.agpMinGainObserved) {
                    this.agpMinGainObserved = this.agpGain;
                }
                sL = delayedL * this.agpGain;
                sR = delayedR * this.agpGain;

                // Soft-clip micro-transients ABOVE 0.992 BEFORE dither so dither remains final
                if (sL > 0.992) sL = 0.992 + Math.tanh((sL - 0.992) * 12.0) * 0.0078;
                else if (sL < -0.992) sL = -0.992 + Math.tanh((sL + 0.992) * 12.0) * 0.0078;

                if (sR > 0.992) sR = 0.992 + Math.tanh((sR - 0.992) * 12.0) * 0.0078;
                else if (sR < -0.992) sR = -0.992 + Math.tanh((sR + 0.992) * 12.0) * 0.0078;
            }

            // 8. Final Stage: Inline xorshift32 TPDF / 2nd-Order Psychoacoustic Noise-Shaped Dither
            // Strictly NOTHING modifies sL/sR downstream of this step!
            if (dither !== 'off') {
                let xL = this.rngStateL;
                xL ^= xL << 13; xL ^= xL >>> 17; xL ^= xL << 5;
                const r1L = (xL >>> 0) * inv32Max - 0.5;
                xL ^= xL << 13; xL ^= xL >>> 17; xL ^= xL << 5;
                const r2L = (xL >>> 0) * inv32Max - 0.5;
                this.rngStateL = xL >>> 0;
                const tpdfL = (r1L - r2L) * this.invQuantization;

                let xR = this.rngStateR;
                xR ^= xR << 13; xR ^= xR >>> 17; xR ^= xR << 5;
                const r1R = (xR >>> 0) * inv32Max - 0.5;
                xR ^= xR << 13; xR ^= xR >>> 17; xR ^= xR << 5;
                const r2R = (xR >>> 0) * inv32Max - 0.5;
                this.rngStateR = xR >>> 0;
                const tpdfR = (r1R - r2R) * this.invQuantization;

                if (dither === 'shaped') {
                    const maxErr = this.invQuantization * 2.0;

                    const shapedL = sL + tpdfL - (1.5 * this.ditherErr1L) + (0.65 * this.ditherErr2L);
                    const quantL = Math.round(shapedL * this.quantizationLevels) * this.invQuantization;
                    let errL = quantL - shapedL;
                    if (!Number.isFinite(errL)) errL = 0.0;
                    else if (errL > maxErr) errL = maxErr;
                    else if (errL < -maxErr) errL = -maxErr;
                    this.ditherErr2L = this.ditherErr1L;
                    this.ditherErr1L = errL;
                    sL = quantL;

                    const shapedR = sR + tpdfR - (1.5 * this.ditherErr1R) + (0.65 * this.ditherErr2R);
                    const quantR = Math.round(shapedR * this.quantizationLevels) * this.invQuantization;
                    let errR = quantR - shapedR;
                    if (!Number.isFinite(errR)) errR = 0.0;
                    else if (errR > maxErr) errR = maxErr;
                    else if (errR < -maxErr) errR = -maxErr;
                    this.ditherErr2R = this.ditherErr1R;
                    this.ditherErr1R = errR;
                    sR = quantR;
                } else {
                    sL = Math.round((sL + tpdfL) * this.quantizationLevels) * this.invQuantization;
                    sR = Math.round((sR + tpdfR) * this.quantizationLevels) * this.invQuantization;
                }
            }

            outL[i] = sL;
            outR[i] = sR;
        }

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
