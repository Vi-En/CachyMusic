// SPDX-License-Identifier: GPL-3.0-or-later
import { PcmRangeSource } from './pcm-range.js';
import { PcmReader } from './pcm-reader.js';
import { FlacReader } from './flac-reader.js';
import { AndroidDirectPcmReader } from './android-pcm-reader.js';

let reader = null;
let readerEpoch = 0;

function releaseReader() {
    readerEpoch++;
    if (!reader) return;
    try { reader.close?.(); } catch (_) {}
    reader = null;
}

self.onmessage = async ({ data }) => {
    const activeEpoch = readerEpoch;
    try {
        if (data.type === 'close') {
            releaseReader();
            if (data.id != null) self.postMessage({ id: data.id, ok: true });
            return;
        }
        if (data.type === 'init') {
            releaseReader();
            if (data.format?.codec === 'android-direct') {
                reader = new AndroidDirectPcmReader(data.format, data.rate);
            } else {
                const file = data.file?.kind === 'local-range'
                    ? new PcmRangeSource(data.file.url, data.file.size, data.file.prefix)
                    : data.file;
                reader = new (data.format.codec === 'flac' ? FlacReader : PcmReader)(file, data.format, data.rate);
            }
            self.postMessage({ id: data.id, frames: reader.outputFrames });
            return;
        }
        if (data.type !== 'read' || !reader) throw Error('PCM worker not initialized');
        const myEpoch = readerEpoch;
        const channels = await reader.readFrames(data.first, data.count);
        if (myEpoch !== readerEpoch) return;
        self.postMessage({ id: data.id, channels }, channels.map(a => a.buffer));
    } catch (e) {
        if (data?.type === 'read' && activeEpoch !== readerEpoch) return;
        self.postMessage({ id: data.id, error: e.message });
    }
};
