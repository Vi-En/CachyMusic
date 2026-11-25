// SPDX-License-Identifier: GPL-3.0-or-later
// Stereo-linked lookahead limiter. 4x windowed-sinc peak estimator, not a
// certified BS.1770 meter or a guarantee about the downstream DAC/resampler.
export class PeakLimiter {
    constructor(sampleRate, ceiling = 10 ** (-0.6 / 20)) {
        this.ceiling = ceiling;
        this.delay = Math.max(40, Math.round(sampleRate * 0.0015));
        this.release = 1 - Math.exp(-1 / (0.09 * sampleRate));
        this.taps = 32;
        // Duplicated 2*taps ring allows contiguous unmasked 32-tap reads.
        this.historyL = new Float64Array(this.taps * 2);
        this.historyR = new Float64Array(this.taps * 2);
        this.kernel = new Float64Array(3 * this.taps);
        this.k0 = new Float64Array(this.taps);
        this.k1 = new Float64Array(this.taps);
        this.k2 = new Float64Array(this.taps);
        let l1Max = 0;
        // Reconstruct at three fractional phases between the center samples.
        for (let phase = 1; phase < 4; phase++) {
            let sum = 0;
            for (let j = 0; j < this.taps; j++) {
                const x = j - (this.taps / 2 - 1) - phase / 4;
                const sinc = Math.abs(x) < 1e-12 ? 1 : Math.sin(Math.PI*x)/(Math.PI*x);
                const w = Math.abs(x) >= this.taps/2 ? 0 : 0.42 + 0.5*Math.cos(2*Math.PI*x/this.taps) + 0.08*Math.cos(4*Math.PI*x/this.taps);
                const i = (phase - 1)*this.taps + j;
                sum += this.kernel[i] = sinc*w;
            }
            const dst = phase === 1 ? this.k0 : phase === 2 ? this.k1 : this.k2;
            let l1 = 0;
            for (let j=0;j<this.taps;j++) {
                const norm = this.kernel[(phase-1)*this.taps+j] /= sum;
                dst[j] = norm;
                l1 += Math.abs(norm);
            }
            if (l1 > l1Max) l1Max = l1;
        }
        this.kernelL1Max = l1Max;
        this.audioL = new Float64Array(this.delay+1);
        this.audioR = new Float64Array(this.delay+1);
        // Retain detected peaks long enough to cover the complete delayed FIR neighborhood.
        this.window = this.delay + this.taps;
        this.peaks = new Float64Array(this.window+2);
        this.indices = new Float64Array(this.window+2);
        this.reset();
    }
    reset() {
        this.historyL.fill(0); this.historyR.fill(0);
        this.audioL.fill(0); this.audioR.fill(0);
        this.histPos = this.audioPos = this.head = this.tail = this.index = 0;
        this.loudHold = 0;
        this.gain = 1; this.left = this.right = 0;
    }
    process(left, right, margin = 1e-7) {
        const hL = this.historyL, hR = this.historyR, n = this.taps;
        const pos = this.histPos;
        hL[pos] = left; hL[pos + n] = left;
        hR[pos] = right; hR[pos + n] = right;
        const base = (pos + 1) & (n - 1);
        this.histPos = base;

        const absL = left < 0 ? -left : left;
        const absR = right < 0 ? -right : right;
        const rawPeak = absL > absR ? absL : absR;
        const quietCeiling = this.ceiling * 0.982878873 - Math.max(0.005, margin * 2);
        const quietSampleLimit = quietCeiling / this.kernelL1Max;
        let peak;
        if (rawPeak > quietSampleLimit || !(this.loudHold === 0)) {
            if (rawPeak > quietSampleLimit) this.loudHold = n;
            else this.loudHold--;
            const k0 = this.k0, k1 = this.k1, k2 = this.k2;
            let l0 = 0, r0 = 0, l1 = 0, r1 = 0, l2 = 0, r2 = 0;
            for (let j = 0; j < n; j++) {
                const sL = hL[base + j], sR = hR[base + j];
                const c0 = k0[j], c1 = k1[j], c2 = k2[j];
                l0 += sL * c0; r0 += sR * c0;
                l1 += sL * c1; r1 += sR * c1;
                l2 += sL * c2; r2 += sR * c2;
            }
            const a0 = l0 < 0 ? -l0 : l0, b0 = r0 < 0 ? -r0 : r0;
            const a1 = l1 < 0 ? -l1 : l1, b1 = r1 < 0 ? -r1 : r1;
            const a2 = l2 < 0 ? -l2 : l2, b2 = r2 < 0 ? -r2 : r2;
            peak = rawPeak;
            if (a0 > peak) peak = a0; if (b0 > peak) peak = b0;
            if (a1 > peak) peak = a1; if (b1 > peak) peak = b1;
            if (a2 > peak) peak = a2; if (b2 > peak) peak = b2;
        } else {
            // Every sample in the 32-tap neighborhood is strictly below quietSampleLimit,
            // so reconstructed peak is mathematically < ceiling * 0.982878873 - margin.
            peak = rawPeak * this.kernelL1Max;
        }
        // O(1) amortized running maximum, no allocations on the audio thread.
        const cap = this.peaks.length, i = this.index++;
        const peaks = this.peaks, indices = this.indices;
        let head = this.head, tail = this.tail;
        const expiry = i - this.window;
        while (head !== tail && indices[head] < expiry) {
            if (++head === cap) head = 0;
        }
        while (head !== tail) {
            const last = (tail === 0 ? cap : tail) - 1;
            if (peaks[last] > peak) break;
            tail = last;
        }
        peaks[tail] = peak; indices[tail] = i;
        this.head = head;
        this.tail = tail + 1 === cap ? 0 : tail + 1;

        const audioLen = this.audioL.length;
        const read = this.audioPos + 1 === audioLen ? 0 : this.audioPos + 1;
        const delayedL = this.audioL[read], delayedR = this.audioR[read];
        this.audioL[this.audioPos] = left; this.audioR[this.audioPos] = right;
        this.audioPos = read;

        const max = peaks[head];
        // Additional 0.15 dB allowance for finite interpolation / downstream rounding.
        const target = Math.min(1, Math.max(0, this.ceiling * 0.982878873 - margin) / Math.max(max, 1e-30));
        this.gain = target < this.gain ? target : this.gain + (target - this.gain) * this.release;
        const dAbsL = delayedL < 0 ? -delayedL : delayedL;
        const dAbsR = delayedR < 0 ? -delayedR : delayedR;
        const delayedPeak = dAbsL > dAbsR ? dAbsL : dAbsR;
        if (delayedPeak > 0) this.gain = Math.min(this.gain, Math.max(0, this.ceiling - margin) / delayedPeak);
        this.left = delayedL * this.gain; this.right = delayedR * this.gain;
    }
}
