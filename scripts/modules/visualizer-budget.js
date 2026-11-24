// Frame scheduling only. Never changes audio decoding, DSP or Web Audio timing.
export function visualizerFrameIntervalMs({mobile = false, reducedMotion = false, saveData = false} = {}) {
    if (reducedMotion || saveData) return 1000 / 12;
    return mobile ? 1000 / 30 : 1000 / 60;
}
