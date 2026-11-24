// Describe evidence available to the app, not inferred physical DAC performance.
import { getPreAmpGainValue } from './audio-policies.js';
export function resolveTrackFormat(track) {
    if (!track) return '';
    const fmt = String(track.format || '').toUpperCase().trim();
    if (fmt && fmt !== 'AUDIO') return fmt;
    const name = track.filename || track.fullPath || '';
    return name.includes('.') ? name.split('.').pop().toUpperCase() || 'UNKNOWN' : 'UNKNOWN';
}
export function describeSignalPath(state, track, nativeActive, route, dspConfigured) {
    const ctx = state.audioContext;
    const graphRate = ctx && ctx.state !== 'closed' && Number.isFinite(ctx.sampleRate) ? ctx.sampleRate : null;
    const latencyValues = [ctx?.baseLatency, ctx?.outputLatency].filter(v => Number.isFinite(v) && v > 0);
    const graphReady = Boolean(track && graphRate && route && !nativeActive);
    const rate = graphReady ? `${(graphRate / 1000).toFixed(1)} kHz` : 'Unavailable';
    const effects = [];
    for (const [flag, name] of [['isSubsonic','Subsonic'],['isBassBoost','Bass'],['isVocalBoost','Vocal'],['isTrebleBoost','Treble'],['isAmpBoost','Preamp'],['isCrossfeed','Crossfeed'],['isSurroundWidener','Width'],['isAmbiophonics','Ambiophonics'],['isPhaseInvert','Phase'],['isMonoMix','Mono'],['isAgpEnabled','AGP'],['isLimiter','Limiter'],['isReplayGain','ReplayGain'],['isUltrasonic','Ultrasonic']]) {
        if (state[flag]) effects.push(name);
    }
    if (!state.isPeqBypassed && state.peqGains?.some(g => g !== 0)) effects.push('PEQ');
    if (state.ditherMode && state.ditherMode !== 'off') effects.push('Dither');
    if (Math.abs(state.stereoBalance) > .005) effects.push('Balance');
    if (state.currentVolumeValue > 1) effects.push('Overdrive');
    const format = resolveTrackFormat(track);
    const source = track ? [format, track.bitDepth ? `${track.bitDepth}-bit source` : '', track.sampleRate ? `${track.sampleRate} Hz source` : '', track.channels ? `${track.channels} ch` : ''].filter(Boolean).join(' · ') : 'No track loaded';
    const label = nativeActive ? 'ANDROID NATIVE' : !track ? 'READY' : !graphReady ? 'UNVERIFIED' : route === 'direct' ? 'BYPASS' : dspConfigured ? 'DSP CONFIGURED' : 'FLAT DSP';
    const engine = nativeActive ? 'Android media output' : !graphReady ? 'Graph not confirmed' : route === 'direct' ? 'Direct Web Audio route' : route === 'worklet' ? 'AudioWorklet route' : 'Web Audio fallback route';
    const precision = graphReady ? route === 'worklet' ? `Float32 frames / ${state.mathPrecision === '64' && state.isPrecision64 ? '64-bit' : '32-bit'} configured DSP` : 'Float32 Web Audio frames' : 'Unavailable';
    const trim = graphReady && route !== 'direct' ? `${(20 * Math.log10(getPreAmpGainValue(state))).toFixed(1)} dB configured trim` : 'Not measured';
    const latency = graphReady && latencyValues.length ? `${(latencyValues.reduce((a,b)=>a+b,0)*1000).toFixed(1)} ms reported${latencyValues.length < 2 ? ' (partial)' : ''}` : 'Unavailable';
    const output = nativeActive ? 'Hardware rate unverified' : graphReady ? `${rate} graph · hardware rate unverified` : 'Hardware output unverified';
    return {label, engine, precision, trim, latency, output, source, graphReady, decode:graphReady ? `Web Audio Float32 frames · ${rate}` : 'Unavailable',
        dsp:graphReady ? `${engine} · ${effects.length ? 'Configured: ' + effects.join(', ') : 'No optional effects configured'}` : engine,
        state:nativeActive || route==='direct' && graphReady ? 'direct' : graphReady && dspConfigured ? 'dsp' : 'idle'};
}
