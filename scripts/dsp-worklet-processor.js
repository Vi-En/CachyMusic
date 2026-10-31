// CachyMusic - Studio-Grade 64-Bit Floating Point DSP AudioWorklet Processor
// Implements Neutron-inspired Double Precision 64-Bit Math, Automatic Gain Protection (AGP),
// Subsonic 20Hz High-Pass Filter, Ultrasonic IMD Filter, Mid/Side Stereo Width & Balance,
// Phase Polarity Inversion, Ambiophonics R.A.C.E., and 2nd-Order Psychoacoustic Noise-Shaped Dithering.

class CachyMusicDspProcessor extends AudioWorkletProcessor {
    constructor(options) {
        super(options);

        // State & Parameter Configuration
        this.precision64 = true;
        this.agpEnabled = true;          // Neutron-style Automatic Gain Protection (True-Peak Envelope Attenuator)
        this.subsonicEnabled = true;     // 64-Bit 20Hz Butterworth High-Pass Rumble Filter
        this.ultrasonicEnabled = true;   // 64-Bit Ultrasonic IMD Low-Pass Filter
        this.ultrasonicCutoff = 32000;
        this.ditherMode = 'shaped';      // 'off' | 'tpdf' | 'shaped'
        this.ambiophonicsEnabled = false;
        this.ambiophonicsDelaySamples = 4; // ~83us at 48kHz, ~42us at 96kHz
        this.ambiophonicsAttenuation = 0.65;

        // Stereo Imaging & Phase Matrix
        this.phaseInvert = false;        // 180-degree absolute acoustic polarity inversion
        this.monoMix = false;            // Phase-coherent L+R mono summing
        this.stereoWidth = 1.0;          // Mid/Side soundstage width (0.0 = Mono, 1.0 = Native, 1.35 = Holographic)
        this.stereoBalance = 0.0;        // -1.0 (Full Left) to +1.0 (Full Right)
        this.balanceGainL = 1.0;
        this.balanceGainR = 1.0;

        // Sample rate from AudioWorkletGlobalScope
        this.sr = (typeof sampleRate !== 'undefined') ? sampleRate : 48000;

        // 1. 64-Bit Subsonic High-Pass Filter States (20Hz 2nd-Order Butterworth)
        this.subL = new Float64Array(4); // x1, x2, y1, y2
        this.subR = new Float64Array(4);
        this.subCoeffs = new Float64Array(5); // b0, b1, b2, a1, a2
        this.updateSubsonicCoeffs();

        // 2. 64-Bit Ultrasonic Low-Pass Filter States
        this.uL = new Float64Array(4); // x1, x2, y1, y2
        this.uR = new Float64Array(4);
        this.uCoeffs = new Float64Array(5); // b0, b1, b2, a1, a2
        this.updateUltrasonicCoeffs();

        // 3. Ambiophonics R.A.C.E. Delay Ring Buffers
        const maxDelay = 64;
        this.delayBufL = new Float64Array(maxDelay);
        this.delayBufR = new Float64Array(maxDelay);
        this.delayIdx = 0;

        // 4. Automatic Gain Protection (AGP) Envelope State
        this.agpGain = 1.0;
        this.agpCeiling = 0.97723722; // -0.20 dBFS True-Peak Safe Ceiling
        this.agpAttackCoeff = 1.0 - Math.exp(-1.0 / (0.0004 * this.sr)); // 0.4ms fast transient catch
        this.agpReleaseCoeff = 1.0 - Math.exp(-1.0 / (0.420 * this.sr)); // 420ms musical recovery
        this.agpMinGainObserved = 1.0;
        this.telemetryCounter = 0;

        // 5. 2nd-Order Psychoacoustic Noise Shaping Error Feedback Memories (L, R)
        this.ditherErr1L = 0.0;
        this.ditherErr2L = 0.0;
        this.ditherErr1R = 0.0;
        this.ditherErr2R = 0.0;

        // Target bit depth quantization (24-bit signed PCM linear domain)
        this.quantizationLevels = 8388608.0; // 2^23
        this.invQuantization = 1.0 / this.quantizationLevels;

        // Handle configuration messages from main thread
        this.port.onmessage = (event) => {
            const data = event.data;
            if (!data) return;

            if (typeof data.precision64 === 'boolean') {
                this.precision64 = data.precision64;
            }
            if (typeof data.agpEnabled === 'boolean') {
                this.agpEnabled = data.agpEnabled;
                if (!this.agpEnabled) this.agpGain = 1.0;
            }
            if (typeof data.subsonicEnabled === 'boolean') {
                this.subsonicEnabled = data.subsonicEnabled;
            }
            if (typeof data.ultrasonicEnabled === 'boolean') {
                this.ultrasonicEnabled = data.ultrasonicEnabled;
            }
            if (typeof data.ultrasonicCutoff === 'number') {
                this.ultrasonicCutoff = Math.max(18000, Math.min(this.sr * 0.49, data.ultrasonicCutoff));
                this.updateUltrasonicCoeffs();
            }
            if (typeof data.ditherMode === 'string') {
                this.ditherMode = data.ditherMode;
            }
            if (typeof data.ambiophonicsEnabled === 'boolean') {
                this.ambiophonicsEnabled = data.ambiophonicsEnabled;
            }
            if (typeof data.ambiophonicsDelaySamples === 'number') {
                this.ambiophonicsDelaySamples = Math.max(1, Math.min(32, Math.round(data.ambiophonicsDelaySamples)));
            }
            if (typeof data.ambiophonicsAttenuation === 'number') {
                this.ambiophonicsAttenuation = Math.max(0.1, Math.min(0.95, data.ambiophonicsAttenuation));
            }
            if (typeof data.phaseInvert === 'boolean') {
                this.phaseInvert = data.phaseInvert;
            }
            if (typeof data.monoMix === 'boolean') {
                this.monoMix = data.monoMix;
            }
            if (typeof data.stereoWidth === 'number' && !isNaN(data.stereoWidth)) {
                this.stereoWidth = Math.max(0.0, Math.min(2.0, data.stereoWidth));
            }
            if (typeof data.stereoBalance === 'number' && !isNaN(data.stereoBalance)) {
                this.stereoBalance = Math.max(-1.0, Math.min(1.0, data.stereoBalance));
                this.updateBalanceGains();
            }

            // Post back status confirmation
            this.port.postMessage({
                type: 'status',
                precision64: this.precision64,
                agpEnabled: this.agpEnabled,
                subsonicEnabled: this.subsonicEnabled,
                ultrasonicEnabled: this.ultrasonicEnabled,
                ultrasonicCutoff: this.ultrasonicCutoff,
                ditherMode: this.ditherMode,
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
            // Pan Left: keep Left at 1.0, attenuate Right smoothly
            this.balanceGainL = 1.0;
            this.balanceGainR = Math.cos((-bal) * Math.PI * 0.5);
        } else {
            // Pan Right: attenuate Left smoothly, keep Right at 1.0
            this.balanceGainL = Math.cos(bal * Math.PI * 0.5);
            this.balanceGainR = 1.0;
        }
    }

    // 2nd-Order Butterworth High-Pass Filter @ 20Hz in 64-bit precision
    updateSubsonicCoeffs() {
        const cutoff = 20.0;
        const omega = (2.0 * Math.PI * cutoff) / this.sr;
        const cosw = Math.cos(omega);
        const sinw = Math.sin(omega);
        const Q = 0.7071067811865475;
        const alpha = sinw / (2.0 * Q);
        const invA0 = 1.0 / (1.0 + alpha);

        this.subCoeffs[0] = ((1.0 + cosw) * 0.5) * invA0; // b0
        this.subCoeffs[1] = -(1.0 + cosw) * invA0;        // b1
        this.subCoeffs[2] = ((1.0 + cosw) * 0.5) * invA0; // b2
        this.subCoeffs[3] = (-2.0 * cosw) * invA0;        // a1
        this.subCoeffs[4] = (1.0 - alpha) * invA0;        // a2
    }

    // 2nd-order Butterworth Low-Pass Biquad in 64-bit precision
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

        const omega = (2.0 * Math.PI * targetCutoff) / this.sr;
        const cosw = Math.cos(omega);
        const sinw = Math.sin(omega);
        const Q = 0.7071067811865475; // Butterworth critical damping
        const alpha = sinw / (2.0 * Q);

        const a0 = 1.0 + alpha;
        const invA0 = 1.0 / a0;

        this.uCoeffs[0] = ((1.0 - cosw) * 0.5) * invA0; // b0
        this.uCoeffs[1] = (1.0 - cosw) * invA0;         // b1
        this.uCoeffs[2] = ((1.0 - cosw) * 0.5) * invA0; // b2
        this.uCoeffs[3] = (-2.0 * cosw) * invA0;        // a1
        this.uCoeffs[4] = (1.0 - alpha) * invA0;        // a2
    }

    // Process block: 128 samples per quantum
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

        const useSubsonic = this.subsonicEnabled;
        const useUltrasonic = this.ultrasonicEnabled;
        const useAmbi = this.ambiophonicsEnabled;
        const useAgp = this.agpEnabled;
        const dither = this.ditherMode;
        const invPhase = this.phaseInvert;
        const isMono = this.monoMix;
        const width = this.stereoWidth;
        const balL = this.balanceGainL;
        const balR = this.balanceGainR;

        // Subsonic coefficients
        const sb0 = this.subCoeffs[0], sb1 = this.subCoeffs[1], sb2 = this.subCoeffs[2];
        const sa1 = this.subCoeffs[3], sa2 = this.subCoeffs[4];

        // Ultrasonic coefficients
        const ub0 = this.uCoeffs[0], ub1 = this.uCoeffs[1], ub2 = this.uCoeffs[2];
        const ua1 = this.uCoeffs[3], ua2 = this.uCoeffs[4];

        const delay = this.ambiophonicsDelaySamples;
        const atten = this.ambiophonicsAttenuation;
        const maxD = this.delayBufL.length;

        for (let i = 0; i < numSamples; i++) {
            let sL = inL[i];
            let sR = inR[i];

            // 1. 64-Bit Subsonic DC & Infrasonic Rumble Filter (20Hz High-Pass)
            if (useSubsonic) {
                const ySubL = sb0 * sL + sb1 * this.subL[0] + sb2 * this.subL[1] - sa1 * this.subL[2] - sa2 * this.subL[3];
                this.subL[1] = this.subL[0];
                this.subL[0] = sL;
                this.subL[3] = this.subL[2];
                this.subL[2] = ySubL;
                sL = ySubL;

                const ySubR = sb0 * sR + sb1 * this.subR[0] + sb2 * this.subR[1] - sa1 * this.subR[2] - sa2 * this.subR[3];
                this.subR[1] = this.subR[0];
                this.subR[0] = sR;
                this.subR[3] = this.subR[2];
                this.subR[2] = ySubR;
                sR = ySubR;
            }

            // 2. 64-Bit Ultrasonic IMD Low-Pass Filter
            if (useUltrasonic) {
                const yL = ub0 * sL + ub1 * this.uL[0] + ub2 * this.uL[1] - ua1 * this.uL[2] - ua2 * this.uL[3];
                this.uL[1] = this.uL[0];
                this.uL[0] = sL;
                this.uL[3] = this.uL[2];
                this.uL[2] = yL;
                sL = yL;

                const yR = ub0 * sR + ub1 * this.uR[0] + ub2 * this.uR[1] - ua1 * this.uR[2] - ua2 * this.uR[3];
                this.uR[1] = this.uR[0];
                this.uR[0] = sR;
                this.uR[3] = this.uR[2];
                this.uR[2] = yR;
                sR = yR;
            }

            // 3. Speaker Ambiophonics R.A.C.E. (Recursive Acoustic Crosstalk Elimination)
            if (useAmbi) {
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

            // 4. Mid/Side Stereo Width, Mono Mixing, Balance & 180° Phase Polarity
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

            // 5. Neutron-Style Automatic Gain Protection (AGP)
            // Dynamically attenuates gain envelope if EQ/DSP boosts push signal above -0.20 dBFS
            if (useAgp) {
                const absL = sL < 0 ? -sL : sL;
                const absR = sR < 0 ? -sR : sR;
                const peak = absL > absR ? absL : absR;
                const targetGain = (peak * this.agpGain > this.agpCeiling && peak > 0.0001)
                    ? (this.agpCeiling / peak)
                    : 1.0;

                if (targetGain < this.agpGain) {
                    this.agpGain += (targetGain - this.agpGain) * this.agpAttackCoeff;
                } else {
                    this.agpGain += (1.0 - this.agpGain) * this.agpReleaseCoeff;
                }
                if (this.agpGain < this.agpMinGainObserved) {
                    this.agpMinGainObserved = this.agpGain;
                }
                sL *= this.agpGain;
                sR *= this.agpGain;
            }

            // 6. TPDF Dithering & 2nd-Order Psychoacoustic Noise Shaping
            if (dither !== 'off') {
                const r1L = Math.random() - 0.5;
                const r2L = Math.random() - 0.5;
                const tpdfL = (r1L - r2L) * this.invQuantization;

                const r1R = Math.random() - 0.5;
                const r2R = Math.random() - 0.5;
                const tpdfR = (r1R - r2R) * this.invQuantization;

                if (dither === 'shaped') {
                    // 2nd-Order High-Pass Error Feedback Filter: H(z) = 1 - 1.5*z^-1 + 0.65*z^-2
                    // Concentrates quantization noise energy above 18kHz away from human ear sensitivity (3-4kHz)
                    const shapedL = sL + tpdfL - (1.5 * this.ditherErr1L) + (0.65 * this.ditherErr2L);
                    const quantL = Math.round(shapedL * this.quantizationLevels) * this.invQuantization;
                    let errL = quantL - shapedL;
                    const maxErr = this.invQuantization * 2.0;
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
                    // Linear Flat TPDF Dither
                    sL = Math.round((sL + tpdfL) * this.quantizationLevels) * this.invQuantization;
                    sR = Math.round((sR + tpdfR) * this.quantizationLevels) * this.invQuantization;
                }
            }

            // 7. True-Peak Soft-Knee Safety Guard & Non-Finite Protection (prevents NaN or DAC overflow)
            if (!Number.isFinite(sL) || !Number.isFinite(sR)) {
                sL = 0.0;
                sR = 0.0;
                this.subL.fill(0);
                this.subR.fill(0);
                this.uL.fill(0);
                this.uR.fill(0);
                this.ditherErr1L = 0.0;
                this.ditherErr2L = 0.0;
                this.ditherErr1R = 0.0;
                this.ditherErr2R = 0.0;
                this.agpGain = 1.0;
            } else {
                if (sL > 0.995) sL = 0.995 + Math.tanh((sL - 0.995) * 10.0) * 0.0049;
                else if (sL < -0.995) sL = -0.995 + Math.tanh((sL + 0.995) * 10.0) * 0.0049;

                if (sR > 0.995) sR = 0.995 + Math.tanh((sR - 0.995) * 10.0) * 0.0049;
                else if (sR < -0.995) sR = -0.995 + Math.tanh((sR + 0.995) * 10.0) * 0.0049;
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
