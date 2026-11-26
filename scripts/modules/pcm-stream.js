// SPDX-License-Identifier: GPL-3.0-or-later
// Bounded source scheduler. PCM conversion/resampling happens in a dedicated worker.
let globalRequestSeq = 0;

export class PcmStream {
    constructor(context, destination, file, format, { onStart, onEnd, onError, onProgress, worker = null, keepWorkerAlive = false } = {}) {
        this.ctx = context;
        this.destination = destination;
        this.file = file;
        this.format = format;
        this.onStart = onStart;
        this.onEnd = onEnd;
        this.onError = onError;
        this.onProgress = onProgress;
        this.worker = worker || null;
        this.ownsWorker = !worker;
        this.keepWorkerAlive = Boolean(keepWorkerAlive);
        this.nodes = new Set();
        this.requests = new Map();
        this.sequence = 0;
        this.seekEpoch = 0;
        this.pumpEpoch = 0;
        this.closed = false;
        this.started = false;
    }

    ensureWorker() {
        if (!this.worker) {
            this.worker = new Worker(new URL('./pcm-worker.js', import.meta.url), { type: 'module' });
            this.ownsWorker = true;
        }
        this.worker.onmessage = ({ data }) => {
            const job = this.requests.get(data.id);
            if (!job) return;
            this.requests.delete(data.id);
            clearTimeout(job.timeout);
            data.error ? job.reject(Error(data.error)) : job.resolve(data);
        };
        this.worker.onerror = () => this.fail(Error('PCM decoding worker failed'));
    }

    async prepare(seconds, quickStart = false) {
        if (this.closed || this.prepared || this.preparing) throw Error('Stream cannot be prepared twice');
        if(!Number.isFinite(seconds)||seconds<0||!Number.isInteger(this.ctx.sampleRate)||this.ctx.sampleRate<8000||this.ctx.sampleRate>384000)throw Error('Invalid PCM preparation geometry');
        this.preparing=true;
        this.ensureWorker();
        const { frames } = await this.request({ type: 'init', file: this.file, format: this.format, rate: this.ctx.sampleRate });
        if (this.closed) return;
        if(!Number.isSafeInteger(frames)||frames<=0)throw Error('Invalid PCM worker frame count');
        this.frames = frames;
        this.chunk = Math.max(128, Math.round(this.ctx.sampleRate / 4));
        this.first = Math.min(frames, Math.max(0, Math.floor(seconds * this.ctx.sampleRate)));
        this.cursor = this.first;

        const ready = await this.prebufferChunks(quickStart);
        if (this.closed) return;
        this.ready = ready;
        this.prepared = true;
        this.preparing=false;
    }

    async prebufferChunks(quickStart = false) {
        const ready = [];
        let buffered = 0;
        if (quickStart && this.cursor < this.frames) {
            let responsive = true;
            for (let i = 0; i < 2 && this.cursor < this.frames; i++) {
                const begin = performance.now();
                const channels = await this.read();
                if (this.closed) return ready;
                ready.push(channels);
                buffered += channels[0].length;
                responsive = responsive && performance.now() - begin < 1000 * channels[0].length / this.ctx.sampleRate * 0.45;
            }
            this.fastStart = responsive && (ready.length === 2 || this.cursor === this.frames);
        }
        const target = this.ctx.sampleRate * (this.fastStart ? 0.4 : 0.6);
        while (this.cursor < this.frames && buffered < target) {
            const ch = await this.read();
            if (this.closed) return ready;
            ready.push(ch);
            buffered += ch[0].length;
        }
        return ready;
    }

    async start(seconds, quickStart = false) {
        await this.prepare(seconds, quickStart);
        if (!this.closed) this.startPrepared(this.ctx.currentTime + (quickStart ? 0.035 : 0.12));
    }

    async seek(seconds) {
        if (this.closed || !this.prepared) throw Error('Stream unavailable for seek');
        if(!Number.isFinite(seconds)||seconds<0)throw Error('Invalid PCM seek position');
        const epoch = ++this.seekEpoch;
        clearInterval(this.timer);
        this.timer = null;
        this.started = false;
        this.pumping = false;
        this.ready = null;
        this.clearScheduledNodes();
        this.rejectPendingRequests('PCM seek superseded read');

        this.first = Math.min(this.frames, Math.max(0, Math.floor(Math.max(0, seconds) * this.ctx.sampleRate)));
        this.cursor = this.first;
        const quickStart = Boolean(this.fastStart);
        let ready;
        try { ready = await this.prebufferChunks(quickStart); }
        catch (error) { if (this.closed || epoch !== this.seekEpoch) return false; throw error; }
        if (this.closed || epoch !== this.seekEpoch) return false;
        this.ready = ready;
        this.startPrepared(this.ctx.currentTime + (quickStart ? 0.035 : 0.08), { notify: true });
        return !this.closed && epoch === this.seekEpoch && this.started;
    }

    get endTime() {
        return this.started ? this.anchor + (this.frames - this.first) / this.ctx.sampleRate : NaN;
    }

    startPrepared(when, { notify = true } = {}) {
        if (this.ctx.state && this.ctx.state !== 'running') throw Error('PCM output clock is not running');
        if (this.closed || this.started || !this.ready || !Number.isFinite(when) || when <= this.ctx.currentTime) {
            throw Error('Invalid PCM start clock');
        }
        const epoch = this.seekEpoch;
        this.anchor = this.nextTime = when;
        this.scheduledFrames = 0;
        try{for (const ch of this.ready) this.schedule(ch);}catch(error){this.clearScheduledNodes();throw error;}
        this.ready = null;
        this.started = true;
        try { if (notify) this.onStart?.(this.anchor, this.first / this.ctx.sampleRate); }
        catch (error) {
            if (epoch === this.seekEpoch) { this.clearScheduledNodes(); this.started=false; throw error; }
            // A synchronous callback has transferred ownership to a new seek.
            return;
        }
        if(this.closed || !this.started || epoch !== this.seekEpoch)return;
        clearInterval(this.timer);
        this.timer = setInterval(() => this.pump(), 120);
        void this.pump();
    }

    request(data) {
        if (this.closed) return Promise.reject(Error('Stream stopped'));
        return new Promise((resolve, reject) => {
            const id = ++globalRequestSeq;
            const timeout = setTimeout(() => {
                this.requests.delete(id);
                reject(Error('PCM worker request timed out'));
            }, 5000);
            this.requests.set(id, { resolve, reject, timeout });
            try {
                this.worker.postMessage({ ...data, id });
            } catch (e) {
                clearTimeout(timeout);
                this.requests.delete(id);
                reject(e);
            }
        });
    }

    async read() {
        const first = this.cursor, epoch = this.seekEpoch;
        const count = Math.min(this.chunk, this.frames - first);
        const { channels } = await this.request({ type: 'read', first, count });
        if (this.closed || epoch !== this.seekEpoch || first !== this.cursor) throw Error('Stale PCM read');
        if (!Array.isArray(channels) || channels.length < 1 || channels.length > 2 || channels.some(ch => !(ch instanceof Float32Array) || ch.length !== count)) {
            throw Error('Invalid PCM worker response');
        }
        const expected=this.format.channels??this.format.numberOfChannels;
        if(expected!=null&&channels.length!==expected)throw Error('PCM channel layout changed');
        // Worker checks decoded floats; also reject malformed transferred data at the consumer boundary.
        for(const channel of channels)for(const sample of channel)if(!Number.isFinite(sample))throw Error('Nonfinite PCM worker response');
        this.cursor = first + count;
        return channels;
    }

    schedule(ch) {
        const n = ch[0].length;
        if (!n) return;
        const b = this.ctx.createBuffer(ch.length, n, this.ctx.sampleRate);
        for (let c = 0; c < ch.length; c++) b.copyToChannel(ch[c], c);
        const source = this.ctx.createBufferSource();
        source.buffer = b;
        try{source.connect(this.destination);}catch(error){try{source.disconnect();}catch{}throw error;}
        this.nodes.add(source);
        source.onended = () => {
            if (!this.nodes.delete(source)) return;
            try { source.disconnect(); } catch (_) {}
            // Keep refills flowing immediately when OS background timers throttle setInterval.
            if (!this.closed && this.started && !this.pumping && this.nextTime - this.ctx.currentTime < 2.2) {
                void this.pump();
            }
        };
        // Allocation/copy can take long enough to miss a scheduled boundary.
        // Starting a past-due buffer would shift its clock and overlap audio.
        if(this.ctx.currentTime>=this.nextTime){
            source.onended=null;this.nodes.delete(source);source.disconnect();
            throw Error('PCM scheduling deadline missed. Resume to retry.');
        }
        try{source.start(this.nextTime);}catch(error){source.onended=null;this.nodes.delete(source);try{source.disconnect();}catch{}throw error;}
        this.scheduledFrames += n;
        this.nextTime = this.anchor + this.scheduledFrames / this.ctx.sampleRate;
    }

    async pump() {
        if (this.closed || !this.started || this.pumping) return;
        const epoch = this.seekEpoch;
        const myPump = ++this.pumpEpoch;
        this.pumping = true;
        try {
            if(this.ctx.state&&this.ctx.state!=='running')return;
            this.onProgress?.(this);
            // Callbacks may synchronously stop, seek or suspend this stream.
            if (this.closed || !this.started || epoch !== this.seekEpoch || (this.ctx.state && this.ctx.state !== 'running')) return;
            if (this.ctx.currentTime >= this.nextTime) {
                if (this.cursor >= this.frames) {
                    this.stop();
                    this.onEnd?.();
                    return;
                }
                throw Error('PCM streaming underrun. Resume to retry.');
            }
            while (!this.closed && epoch === this.seekEpoch && this.cursor < this.frames && this.nextTime - this.ctx.currentTime < 2.5) {
                const ch = await this.read();
                if (this.closed || epoch !== this.seekEpoch) return;
                if(this.ctx.state&&this.ctx.state!=='running'){this.cursor-=ch[0].length;return;}
                if (this.ctx.currentTime >= this.nextTime) throw Error('PCM streaming underrun. Resume to retry.');
                this.schedule(ch);
            }
            if (!this.closed && epoch === this.seekEpoch) this.onProgress?.(this);
        } catch (e) {
            if (epoch === this.seekEpoch) this.fail(e);
        } finally {
            if (this.pumpEpoch === myPump) this.pumping = false;
        }
    }

    position() {
        return this.started
            ? Math.min(this.format.duration, this.first / this.ctx.sampleRate + Math.max(0, Math.min(this.nextTime, this.ctx.currentTime) - this.anchor))
            : 0;
    }

    clearScheduledNodes() {
        for (const source of this.nodes) {
            source.onended = null;
            try { source.stop(); } catch (_) {}
            try { source.disconnect(); } catch (_) {}
        }
        this.nodes.clear();
    }

    rejectPendingRequests(reason) {
        for (const job of this.requests.values()) {
            clearTimeout(job.timeout);
            job.reject(Error(reason));
        }
        this.requests.clear();
    }

    fail(error) {
        if (this.closed) return;
        const position = this.position();
        this.stop();
        this.onError?.(error, position);
    }

    stop() {
        if (this.closed) return;
        this.closed = true;
        this.started = false;
        this.ready = null;
        clearInterval(this.timer);
        if (this.worker) {
            if (this.keepWorkerAlive && !this.ownsWorker) {
                this.worker.onmessage = null;
                this.worker.onerror = null;
                try { this.worker.postMessage({ type: 'close' }); } catch (_) {}
            } else {
                try { this.worker.terminate(); } catch (_) {}
            }
        }
        this.rejectPendingRequests('Stream stopped');
        this.clearScheduledNodes();
    }
}
