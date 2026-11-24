// SPDX-License-Identifier: GPL-3.0-or-later
// Stereo-linked lookahead limiter. 4x windowed-sinc peak estimator, not a
// certified BS.1770 meter or a guarantee about the downstream DAC/resampler.
export class PeakLimiter {
    constructor(sampleRate, ceiling = 10 ** (-0.6 / 20)) {
        this.ceiling = ceiling;
        this.delay = Math.max(40, Math.round(sampleRate * 0.0015));
        this.release = 1 - Math.exp(-1 / (0.09 * sampleRate));
        this.taps = 32;
        this.historyL = new Float64Array(this.taps);
        this.historyR = new Float64Array(this.taps);
        this.kernel = new Float64Array(3 * this.taps);
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
            for (let j=0;j<this.taps;j++) this.kernel[(phase-1)*this.taps+j] /= sum;
        }
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
        this.gain = 1; this.left = this.right = 0;
    }
    process(left, right, margin = 1e-7) {
        const hL=this.historyL,hR=this.historyR, k=this.kernel, n=this.taps;
        hL[this.histPos]=left; hR[this.histPos]=right;
        this.histPos=(this.histPos+1)&(n-1);
        let peak=Math.max(Math.abs(left),Math.abs(right));
        for(let p=0;p<3;p++) {
            let l=0,r=0;
            for(let j=0;j<n;j++) {
                const ix=(this.histPos+j)&(n-1), c=k[p*n+j];
                l+=hL[ix]*c; r+=hR[ix]*c;
            }
            peak=Math.max(peak,Math.abs(l),Math.abs(r));
        }
        // O(1) amortized running maximum, no allocations on the audio thread.
        const cap=this.peaks.length, i=this.index++;
        while(this.head!==this.tail && this.indices[this.head] < i-this.window) this.head=(this.head+1)%cap;
        while(this.head!==this.tail) {
            const last=(this.tail+cap-1)%cap;
            if(this.peaks[last]>peak)break;
            this.tail=last;
        }
        this.peaks[this.tail]=peak; this.indices[this.tail]=i; this.tail=(this.tail+1)%cap;
        const read=(this.audioPos+1)%this.audioL.length;
        const delayedL=this.audioL[read], delayedR=this.audioR[read];
        this.audioL[this.audioPos]=left; this.audioR[this.audioPos]=right; this.audioPos=read;
        const max=this.peaks[this.head];
        // Additional 0.15 dB allowance for finite interpolation / downstream rounding.
        const target=Math.min(1,Math.max(0,this.ceiling*0.982878873-margin)/Math.max(max,1e-30));
        this.gain=target<this.gain?target:this.gain+(target-this.gain)*this.release;
        const delayedPeak=Math.max(Math.abs(delayedL),Math.abs(delayedR));
        if(delayedPeak>0)this.gain=Math.min(this.gain,Math.max(0,this.ceiling-margin)/delayedPeak);
        this.left=delayedL*this.gain; this.right=delayedR*this.gain;
    }
}
