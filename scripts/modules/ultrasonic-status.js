// Report an ultrasonic filter as active only when it is in the worklet signal
// path and its cutoff is below the usable Nyquist guard band.  A persisted
// request is not evidence of DSP operation or DAC output capabilities.
export function ultrasonicFilterPossible(cutoffHz, contextRateHz) {
    return Number.isFinite(cutoffHz) && Number.isFinite(contextRateHz)
        && cutoffHz > 0 && contextRateHz > 0
        && cutoffHz < contextRateHz * 0.475;
}

export function ultrasonicFilterStatus({enabled, cutoffHz, contextRateHz, workletReady = false}) {
    if (!enabled) return {code:'off', text:'BYPASS'};
    if (!Number.isFinite(contextRateHz) || contextRateHz <= 0) {
        return {code:'pending', text:'REQUESTED · OUTPUT UNKNOWN'};
    }
    if (!ultrasonicFilterPossible(cutoffHz, contextRateHz)) {
        return {code:'unavailable', text:`BYPASS · ${Math.round(contextRateHz / 1000)} kHz GRAPH`};
    }
    const cutoffLabel = `${Math.round(cutoffHz / 1000)} kHz`;
    return workletReady
        ? {code:'active', text:`ACTIVE · ${cutoffLabel}`}
        : {code:'configured', text:`CONFIGURED · ${cutoffLabel}`};
}
