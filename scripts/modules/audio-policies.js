// Pure DSP control policies; no DOM, audio nodes, or global state.

export function createSoftClipCurve(samples = 2048) {
    const curve = new Float32Array(samples);
    // Smooth sample-domain compression above 0.891; not a DAC or true-peak guarantee.
    const ceiling = 0.891;
    for (let i = 0; i < samples; i++) {
        // Normalized input range from -1 to +1
        const x = (i * 2) / (samples - 1) - 1;
        if (x < -ceiling) {
            curve[i] = -ceiling - (1.0 - ceiling) * Math.tanh((-x - ceiling) / (1.0 - ceiling));
        } else if (x > ceiling) {
            curve[i] = ceiling + (1.0 - ceiling) * Math.tanh((x - ceiling) / (1.0 - ceiling));
        } else {
            curve[i] = x;
        }
    }
    return curve;
}

export function createLinearCurve(samples = 2048) {
    const curve = new Float32Array(samples);
    for (let i = 0; i < samples; i++) {
        curve[i] = (i * 2) / (samples - 1) - 1;
    }
    return curve;
}

export function computeLimiterProfile(s) {
    if (!s.isLimiter) {
        return {
            threshold: 0,
            knee: 0,
            ratio: 1.0,
            attack: 0.0018,
            release: 0.090,
            isBypassed: true
        };
    }

    let threshold = -1.5; // dBFS
    let knee = 2.8;       // dB
    let ratio = 20.0;     // ratio (Brickwall)
    let attack = 0.0018;  // seconds (1.8ms)
    let release = 0.090;  // seconds (90ms)

    if (s.isBassBoost) {
        threshold -= 1.2;
        knee += 1.5;
        release = Math.max(release, 0.125);
    }

    if (s.isAmpBoost) {
        threshold -= 2.0;
        knee += 1.5;
        attack = 0.0015;
        release = Math.max(release, 0.100);
    }

    if (s.currentVolumeValue > 1.0 && !s.isHardwareGain) {
        const overdrive = (s.currentVolumeValue - 1.0) / 0.5;
        threshold -= overdrive * 2.0;
        knee += overdrive * 1.5;
        attack = Math.min(attack, 0.0012);
        release = Math.max(release, 0.110);
    }

    if (s.isVocalBoost) {
        threshold -= 0.8;
        knee += 0.8;
    }

    if (s.isTrebleBoost) {
        threshold -= 0.6;
        attack = Math.min(attack, 0.0012);
    }

    threshold = Math.max(-8.0, Math.min(-1.2, threshold));
    knee = Math.min(8.0, knee);

    return {
        threshold,
        knee,
        ratio,
        attack,
        release,
        isBypassed: false
    };
}

export function getEffectiveAmplification(s) {
    let ampDb = s.isAmpBoost ? 3.6 : 0;
    if (s.currentVolumeValue > 1.0) {
        const overdrive = (s.currentVolumeValue - 1.0) / 0.5;
        ampDb += overdrive * 3.0;
    }
    return Math.pow(10, ampDb / 20);
}

export function getPreAmpGainValue(s) {
    let maxBoost = 0;
    if (!s.isPeqBypassed) {
        if (s.isBassBoost) maxBoost = Math.max(maxBoost, 3.8);
        if (s.isTrebleBoost) maxBoost = Math.max(maxBoost, 3.0);
        if (s.isVocalBoost) maxBoost = Math.max(maxBoost, 2.8);
        if (s.peqGains && s.peqGains.length) {
            for (const g of s.peqGains) {
                if (g > maxBoost) maxBoost = g;
            }
        }
    } else {
        if (s.isBassBoost) maxBoost = Math.max(maxBoost, 3.8);
        if (s.isTrebleBoost) maxBoost = Math.max(maxBoost, 3.0);
        if (s.isVocalBoost) maxBoost = Math.max(maxBoost, 2.8);
    }
    const trimDb = maxBoost > 0 ? -(maxBoost * 0.70) : 0;
    return Math.pow(10, trimDb / 20);
}

export function computeReplayGainMultiplier(s) {
    const curTrack = s.currentTrack || s.allTracks[s.currentTrackIndex];
    let rg = 1.0;
    if (s.isReplayGain && curTrack && typeof curTrack.replayGain === 'number' && !isNaN(curTrack.replayGain)) {
        rg = Math.pow(10, curTrack.replayGain / 20);
        if (typeof curTrack.replayPeak === 'number' && curTrack.replayPeak > 0 && (rg * curTrack.replayPeak) > 0.965) {
            rg = 0.965 / curTrack.replayPeak;
        }
    }
    return rg;
}

export function hasUserShapingDsp(s) {
    const hasPeq = !s.isPeqBypassed && Array.isArray(s.peqGains) && s.peqGains.some(g => Math.abs(g) > 0.001);
    const hasTone = s.isBassBoost || s.isVocalBoost || s.isTrebleBoost;
    const hasStage = s.isAmpBoost || s.isLimiter || s.isCrossfeed || s.isAmbiophonics
        || s.isSurroundWidener || s.isPhaseInvert || s.isMonoMix || s.isUltrasonic
        || s.isReplayGain || s.isSubsonic || s.isAgpEnabled || s.ditherMode!=='off' || (Math.abs(s.stereoBalance) > 0.005) || (s.currentVolumeValue > 1.0);
    return hasPeq || hasTone || hasStage;
}
