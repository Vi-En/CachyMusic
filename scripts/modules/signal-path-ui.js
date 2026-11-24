// Presentation adapter for the signal-path audit. Updates every field on every route.
import { describeSignalPath } from './signal-path-model.js';
export function renderSignalPath(state, track, nativeActive, route, dspConfigured, doc = document) {
    const info = describeSignalPath(state, track, nativeActive, route, dspConfigured);
    const set = (id, value) => { const el = doc.getElementById(id); if (el) el.textContent = value; };
    set('signalPathLabel', info.label);
    const badge = doc.getElementById('signalPathBadgeBtn');
    if (badge) badge.dataset.signalState = info.state;
    const quality = doc.getElementById('auditQualityBadge');
    if (quality) { quality.textContent = info.engine; quality.className = 'signalQualityBadge'; }
    for (const id of ['deckSignalDot','auditQualityDot']) {
        const el = doc.getElementById(id); if (el) el.style.color = 'var(--text-muted)';
    }
    set('auditQualityDesc', 'Graph routing and configuration are reported where available. Physical DAC rate, clipping margin and bit-perfect output are not verified.');
    set('auditStageSource', info.source);
    set('auditStageDecode', info.decode);
    set('auditStageDsp', info.dsp);
    set('auditStageOutput', info.output);
    set('auditMetricHeadroom', info.trim);
    set('auditMetricLatency', info.latency);
    set('auditMetricPrecision', info.precision);
    set('auditMetricPrecisionDesc', 'Frame format and configured processing precision, not physical DAC bit depth.');
    set('settingsDspEngineVal', info.engine);
    set('settingsDspHeadroomVal', info.trim);
    set('settingsDspLatencyVal', info.latency);
    set('settingsDspEqVal', info.dsp);
    set('statDacStream', info.output);
    const dac = doc.getElementById('statDacStream');
    if (dac) { dac.style.color = 'inherit'; dac.title = 'Graph sample rate is not the physical device sample rate.'; }
    return info;
}
