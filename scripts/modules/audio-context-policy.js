// Prefer the output-device native rate by default. Explicit track-rate AudioContexts
// can run DSP at 192 kHz on a 48 kHz phone output, increasing CPU cost while the OS
// still resamples. Source format and actual output rate are reported separately.
export function createPlaybackAudioContext(AudioCtor, latencyHint) {
    try { return new AudioCtor({latencyHint}); }
    catch (_) { return new AudioCtor(); }
}
