// CachyMusic - Audiophile 32-Bit Floating Point DSP Engine
    function createSoftClipCurve(samples = 2048) {
        const curve = new Float32Array(samples);
        // Audiophile Analog Soft-Clip Curve:
        // 100% linear pass-through up to 0.891 (-1.0 dBFS).
        // Smoothly transitions into continuous tanh compression for extreme micro-transients,
        // asymptotically capping output at ~0.950 (-0.45 dBFS) to guarantee zero square-wave DAC clipping.
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

    function createLinearCurve(samples = 2048) {
        const curve = new Float32Array(samples);
        for (let i = 0; i < samples; i++) {
            curve[i] = (i * 2) / (samples - 1) - 1;
        }
        return curve;
    }

    function computeLimiterProfile() {
        if (!isLimiter) {
            return {
                threshold: 0,
                knee: 0,
                ratio: 1.0,
                attack: 0.0018,
                release: 0.090,
                isBypassed: true
            };
        }

        // Base transparent studio master limiter profile
        // - Ratio 20:1 brickwall peak arrest
        // - 1.8ms attack captures transient crests without dulling percussion snap
        // - 90ms release ensures swift gain recovery without pumping or breathing
        let threshold = -1.5; // dBFS
        let knee = 2.8;       // dB
        let ratio = 20.0;     // ratio (Brickwall)
        let attack = 0.0018;  // seconds (1.8ms)
        let release = 0.090;  // seconds (90ms)

        // Low-End Headroom for BASS BOOST (95 Hz Harman Shelf):
        // Low-frequency waves have long physical periods (~10.5ms at 95 Hz).
        // 1. Threshold lowers by -1.2 dB to catch heavy sub-bass crests before DAC saturation.
        // 2. Knee widens by +1.5 dB for an organic, musical onset.
        // 3. Release extends to 125ms (0.125s) to guarantee zero inter-cycle gain modulation (eliminates buzz/flab).
        if (isBassBoost) {
            threshold -= 1.2;
            knee += 1.5;
            release = Math.max(release, 0.125);
        }

        // Clean Preamp Headroom for AMP BOOST (+3.6 dB broadcast amplification):
        // Pulls threshold down by -2.0 dB and widens knee to seamlessly absorb the +3.6 dB gain without distortion.
        if (isAmpBoost) {
            threshold -= 2.0;
            knee += 1.5;
            attack = 0.0015;
            release = Math.max(release, 0.100);
        }

        // Dynamic Headroom for VOLUME OVERDRIVE (> 100% up to 150%):
        // Dynamically scales limitation based on the exact amount of volume overdrive.
        if (currentVolumeValue > 1.0) {
            const overdrive = (currentVolumeValue - 1.0) / 0.5; // 0 to 1
            threshold -= overdrive * 2.0;
            knee += overdrive * 1.5;
            attack = Math.min(attack, 0.0012);
            release = Math.max(release, 0.110);
        }

        // Vocal Presence Headroom for VOCAL BOOST (+2.8 dB at 3.0 kHz):
        if (isVocalBoost) {
            threshold -= 0.8;
            knee += 0.8;
        }

        // Transient Clamp for TREBLE BOOST (+3.0 dB at 10.0 kHz):
        // Fast 1.2ms attack swiftly clamps high-frequency transient spikes and prevents digital glare.
        if (isTrebleBoost) {
            threshold -= 0.6;
            attack = Math.min(attack, 0.0012);
        }

        // Guard rails: strictly clamped to maintain studio mastering standards
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

    function updateLimiterState(now = 0) {
        if (!dspLimiter || !audioContext) return;
        const profile = computeLimiterProfile();

        if (profile.isBypassed) {
            dspLimiter.threshold.setTargetAtTime(0, now, 0.02);
            dspLimiter.knee.setTargetAtTime(0, now, 0.02);
            dspLimiter.ratio.setTargetAtTime(1.0, now, 0.02);
            dspLimiter.attack.setTargetAtTime(0.0018, now, 0.02);
            dspLimiter.release.setTargetAtTime(0.090, now, 0.02);
            if (ceilingTrimGain) {
                ceilingTrimGain.gain.setTargetAtTime(1.0, now, 0.02);
            }
            if (ampSoftClipper) {
                ampSoftClipper.curve = createLinearCurve(2048);
            }
        } else {
            dspLimiter.threshold.setTargetAtTime(profile.threshold, now, 0.02);
            dspLimiter.knee.setTargetAtTime(profile.knee, now, 0.02);
            dspLimiter.ratio.setTargetAtTime(profile.ratio, now, 0.02);
            dspLimiter.attack.setTargetAtTime(profile.attack, now, 0.02);
            dspLimiter.release.setTargetAtTime(profile.release, now, 0.02);
            if (ceilingTrimGain) {
                // -0.6 dBFS True Peak headroom ceiling (gain = ~0.93325) guarantees DAC reconstruction safety
                ceilingTrimGain.gain.setTargetAtTime(Math.pow(10, -0.6 / 20), now, 0.02);
            }
            if (ampSoftClipper) {
                ampSoftClipper.curve = createSoftClipCurve(2048);
            }
        }
    }

    function getEffectiveAmplification() {
        // Base clean amplification boost: +3.6 dB when isAmpBoost is enabled (standard broadcast loudness enhancement)
        let ampDb = isAmpBoost ? 3.6 : 0;
        // Extended volume overdrive above 100% (from 1.0 to 1.5 adds up to +3.0 dB clean headroom gain)
        if (currentVolumeValue > 1.0) {
            const overdrive = (currentVolumeValue - 1.0) / 0.5; // 0 to 1
            ampDb += overdrive * 3.0;
        }
        return Math.pow(10, ampDb / 20);
    }

    function updateAmpGain(now = 0) {
        if (!ampGainNode || !audioContext) return;
        const targetLinear = getEffectiveAmplification();
        ampGainNode.gain.setTargetAtTime(targetLinear, now, 0.04);
    }

    function getPreAmpGainValue() {
        let maxBoost = 0;
        if (isBassBoost) maxBoost = Math.max(maxBoost, 3.8);
        if (isTrebleBoost) maxBoost = Math.max(maxBoost, 3.0);
        if (isVocalBoost) maxBoost = Math.max(maxBoost, 2.8);
        if (peqGains && peqGains.length) {
            for (const g of peqGains) {
                if (g > maxBoost) maxBoost = g;
            }
        }
        // Attenuate input by 70% of max positive boost to preserve dynamic range headroom without clipping
        const trimDb = maxBoost > 0 ? -(maxBoost * 0.70) : 0;
        return Math.pow(10, trimDb / 20);
    }

    function updatePreAmpGain(now = 0) {
        if (!preAmpGainNode || !audioContext) return;
        const target = getPreAmpGainValue();
        preAmpGainNode.gain.setTargetAtTime(target, now, 0.025);
    }

    // Audiophile Bauer / Jan Meier Natural Headphone Crossfeed Network (Unity-Gain Mono Bass)
    // Direct path: -2.85 dB (0.72) below 700 Hz + +2.85 dB high-shelf above 700 Hz (0 dB HF pass-through)
    // Cross path:  -11.0 dB (0.28) low-pass at 700 Hz with 300μs interaural delay (0.72 + 0.28 = 1.00 unity mono bass)
    function createCrossfeedNetwork(ctx) {
        if (!ctx) return null;
        try {
            const splitter = ctx.createChannelSplitter(2);
            const merger = ctx.createChannelMerger(2);

            const directGainL = ctx.createGain();
            const directGainR = ctx.createGain();
            directGainL.gain.value = 0.72;
            directGainR.gain.value = 0.72;

            const directShelfL = ctx.createBiquadFilter();
            const directShelfR = ctx.createBiquadFilter();
            directShelfL.type = 'highshelf';
            directShelfL.frequency.value = 700;
            directShelfL.gain.value = 2.85;
            directShelfR.type = 'highshelf';
            directShelfR.frequency.value = 700;
            directShelfR.gain.value = 2.85;

            const filterL = ctx.createBiquadFilter();
            const filterR = ctx.createBiquadFilter();
            filterL.type = 'lowpass';
            filterL.frequency.value = 700;
            filterL.Q.value = 0.707;

            filterR.type = 'lowpass';
            filterR.frequency.value = 700;
            filterR.Q.value = 0.707;

            const delayL = ctx.createDelay(0.01);
            const delayR = ctx.createDelay(0.01);
            delayL.delayTime.value = 0.00030; // 300 microseconds ITD
            delayR.delayTime.value = 0.00030;

            const crossGainL = ctx.createGain();
            const crossGainR = ctx.createGain();
            crossGainL.gain.value = 0.28; // -11.0 dB crossfeed (sums with 0.72 direct for 1.00 unity mono bass)
            crossGainR.gain.value = 0.28;

            // Left Channel Routing
            splitter.connect(directGainL, 0);
            directGainL.connect(directShelfL);
            directShelfL.connect(merger, 0, 0);

            splitter.connect(filterL, 0);
            filterL.connect(delayL);
            delayL.connect(crossGainL);
            crossGainL.connect(merger, 0, 1);

            // Right Channel Routing
            splitter.connect(directGainR, 1);
            directGainR.connect(directShelfR);
            directShelfR.connect(merger, 0, 1);

            splitter.connect(filterR, 1);
            filterR.connect(delayR);
            delayR.connect(crossGainR);
            crossGainR.connect(merger, 0, 0);

            return {
                input: splitter,
                output: merger
            };
        } catch (e) {
            console.warn('Crossfeed initialization warning:', e);
            return null;
        }
    }

    function setDspBoost(type, active) {
        if (!audioContext) {
            const track = allTracks[currentTrackIndex];
            const targetRate = (track && track.sampleRate) ? getValidSampleRate(track.sampleRate) : 44100;
            initAudioContext(targetRate);
        }
        const now = audioContext ? audioContext.currentTime : 0;

        if (type === 'limiter') {
            isLimiter = active;
            safeStorage.setItem('cachymusic_limiter', isLimiter ? 'true' : 'false');
        } else if (type === 'amp') {
            isAmpBoost = active;
            safeStorage.setItem('cachymusic_amp_boost', isAmpBoost ? 'true' : 'false');
            updateAmpGain(now);
        } else if (type === 'bass') {
            isBassBoost = active;
            safeStorage.setItem('cachymusic_bass_boost', isBassBoost ? 'true' : 'false');
            if (bassFilter && audioContext) {
                bassFilter.gain.setTargetAtTime(isBassBoost ? 3.8 : 0, now, 0.04);
            }
        } else if (type === 'vocal') {
            isVocalBoost = active;
            safeStorage.setItem('cachymusic_vocal_boost', isVocalBoost ? 'true' : 'false');
            if (vocalFilter && audioContext) {
                vocalFilter.gain.setTargetAtTime(isVocalBoost ? 2.8 : 0, now, 0.04);
            }
        } else if (type === 'treble') {
            isTrebleBoost = active;
            safeStorage.setItem('cachymusic_treble_boost', isTrebleBoost ? 'true' : 'false');
            if (trebleFilter && audioContext) {
                trebleFilter.gain.setTargetAtTime(isTrebleBoost ? 3.0 : 0, now, 0.04);
            }
        } else if (type === 'xfeed') {
            isCrossfeed = active;
            safeStorage.setItem('cachymusic_crossfeed', isCrossfeed ? 'true' : 'false');
        } else if (type === 'subsonic') {
            isSubsonic = active;
            safeStorage.setItem('cachymusic_subsonic', isSubsonic ? 'true' : 'false');
            if (subsonicFilter && audioContext) {
                subsonicFilter.frequency.setTargetAtTime(isSubsonic ? 20 : 5, now, 0.04);
            }
        } else if (type === 'agp') {
            isAgpEnabled = active;
            safeStorage.setItem('cachymusic_agp', isAgpEnabled ? 'true' : 'false');
        } else if (type === 'surround') {
            isSurroundWidener = active;
            safeStorage.setItem('cachymusic_surround_ms', isSurroundWidener ? 'true' : 'false');
        } else if (type === 'phase') {
            isPhaseInvert = active;
            safeStorage.setItem('cachymusic_phase_invert', isPhaseInvert ? 'true' : 'false');
        } else if (type === 'mono') {
            isMonoMix = active;
            safeStorage.setItem('cachymusic_mono_mix', isMonoMix ? 'true' : 'false');
        }

        updateWorkletParams();
        updatePreAmpGain(now);
        updateAudioRouting();
        updateLimiterState(now);
        updateDspButtonsUi();
    }

    function toggleDspBoost(type) {
        if (type === 'limiter') setDspBoost('limiter', !isLimiter);
        else if (type === 'amp') setDspBoost('amp', !isAmpBoost);
        else if (type === 'bass') setDspBoost('bass', !isBassBoost);
        else if (type === 'vocal') setDspBoost('vocal', !isVocalBoost);
        else if (type === 'treble') setDspBoost('treble', !isTrebleBoost);
        else if (type === 'xfeed') setDspBoost('xfeed', !isCrossfeed);
        else if (type === 'subsonic') setDspBoost('subsonic', !isSubsonic);
        else if (type === 'agp') setDspBoost('agp', !isAgpEnabled);
        else if (type === 'surround') setDspBoost('surround', !isSurroundWidener);
        else if (type === 'phase') setDspBoost('phase', !isPhaseInvert);
        else if (type === 'mono') setDspBoost('mono', !isMonoMix);
        else if (type === 'peq') {
            const peqModal = document.getElementById('peqModal');
            if (peqModal) {
                const isCurrentlyOpen = peqModal.style.display === 'flex' || window.getComputedStyle(peqModal).display === 'flex';
                if (isCurrentlyOpen) {
                    if (typeof closePeqModal === 'function') closePeqModal();
                    else peqModal.style.display = 'none';
                } else {
                    if (typeof openPeqModal === 'function') openPeqModal();
                    else {
                        peqModal.style.display = 'flex';
                        setTimeout(drawPeqCurve, 40);
                    }
                }
            }
        }
    }

    function updateDspButtonsUi() {
        const dspBtns = document.querySelectorAll('[data-target="limiter"], [data-target="amp"], [data-target="bass"], [data-target="vocal"], [data-target="treble"], [data-target="xfeed"], [data-target="subsonic"], [data-target="agp"], [data-target="surround"], [data-target="phase"], [data-target="mono"], [data-target="peq"]');
        dspBtns.forEach(btn => {
            const target = btn.dataset.target;
            const isActive = (target === 'limiter' && isLimiter) ||
                             (target === 'amp' && isAmpBoost) ||
                             (target === 'bass' && isBassBoost) ||
                             (target === 'vocal' && isVocalBoost) ||
                             (target === 'treble' && isTrebleBoost) ||
                             (target === 'xfeed' && isCrossfeed) ||
                             (target === 'subsonic' && isSubsonic) ||
                             (target === 'agp' && isAgpEnabled) ||
                             (target === 'surround' && isSurroundWidener) ||
                             (target === 'phase' && isPhaseInvert) ||
                             (target === 'mono' && isMonoMix) ||
                             (target === 'peq' && !isPeqBypassed && peqGains.some(g => g !== 0));
            btn.classList.toggle('active', isActive);
            btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
            const dot = btn.querySelector('.dspDot');
            if (dot) dot.classList.toggle('active', isActive);
        });

        const peqXfeedStatus = document.getElementById('peqXfeedStatus');
        if (peqXfeedStatus) peqXfeedStatus.textContent = isCrossfeed ? 'ON' : 'OFF';
        const peqAgpStatus = document.getElementById('peqAgpStatus');
        if (peqAgpStatus) peqAgpStatus.textContent = isAgpEnabled ? 'GUARD ON' : 'BYPASS';
        const peqSurroundStatus = document.getElementById('peqSurroundStatus');
        if (peqSurroundStatus) peqSurroundStatus.textContent = isSurroundWidener ? '135% WIDE' : '100%';
        const peqPhaseStatus = document.getElementById('peqPhaseStatus');
        if (peqPhaseStatus) peqPhaseStatus.textContent = isPhaseInvert ? '180° INV' : '0° NORM';
        const peqMonoStatus = document.getElementById('peqMonoStatus');
        if (peqMonoStatus) peqMonoStatus.textContent = isMonoMix ? 'MONO L+R' : 'STEREO';

        const isPeqActive = !isPeqBypassed && peqGains.some(g => g !== 0);
        const playerPeqBadge = document.getElementById('playerPeqBadge');
        if (playerPeqBadge) {
            playerPeqBadge.textContent = isPeqActive ? 'ACTIVE' : '10-BAND';
            playerPeqBadge.classList.toggle('active', isPeqActive);
        }

        const activeDspCount = [isAmpBoost, isBassBoost, isVocalBoost, isTrebleBoost, isLimiter, isCrossfeed, isSurroundWidener, isPhaseInvert, isMonoMix].filter(Boolean).length;
        const playerDspCountBadge = document.getElementById('playerDspCountBadge');
        if (playerDspCountBadge) {
            if (activeDspCount > 0) {
                playerDspCountBadge.textContent = `+${activeDspCount} DSP`;
                playerDspCountBadge.style.display = 'inline-flex';
                playerDspCountBadge.classList.add('active');
            } else {
                playerDspCountBadge.style.display = 'none';
                playerDspCountBadge.classList.remove('active');
            }
        }

        const peqDspActiveSummary = document.getElementById('peqDspActiveSummary');
        if (peqDspActiveSummary) {
            peqDspActiveSummary.textContent = activeDspCount > 0 ? `${activeDspCount} ACTIVE` : (isAgpEnabled ? 'AGP GUARD READY' : 'ALL BYPASSED');
            peqDspActiveSummary.classList.toggle('active', activeDspCount > 0 || isAgpEnabled);
        }

        const playerPeqBtn = document.getElementById('playerPeqBtn');
        if (playerPeqBtn) {
            playerPeqBtn.classList.toggle('active', isPeqActive || activeDspCount > 0);
        }

        updateDacStatusUi();
        if (allTracks[currentTrackIndex]) {
            updateTrackBadgeUi(allTracks[currentTrackIndex]);
        }
    }

    function setupDspControls() {
        updateDspButtonsUi();
        const dspBtns = document.querySelectorAll('[data-target="limiter"], [data-target="amp"], [data-target="bass"], [data-target="vocal"], [data-target="treble"], [data-target="xfeed"], [data-target="subsonic"], [data-target="agp"], [data-target="surround"], [data-target="phase"], [data-target="mono"], [data-target="peq"]');
        dspBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                toggleDspBoost(btn.dataset.target);
            });
        });
    }

    // =========================================================================
    // 10-Band Parametric Equalizer (PEQ) & AutoEQ Compensation Engine
    // =========================================================================
    function setPeqBandGain(bandIndex, gainDb) {
        if (bandIndex < 0 || bandIndex >= PEQ_FREQS.length) return;
        const clampedGain = Math.max(-15, Math.min(15, Number(gainDb) || 0));
        peqGains[bandIndex] = clampedGain;
        try {
            safeStorage.setItem('cachymusic_peq_gains', JSON.stringify(peqGains));
        } catch (_) {}

        if (peqNodes && peqNodes[bandIndex] && audioContext) {
            const now = audioContext.currentTime;
            peqNodes[bandIndex].gain.setTargetAtTime(isPeqBypassed ? 0 : clampedGain, now, 0.04);
        }
        updateAudioRouting();
        updateLimiterState(audioContext ? audioContext.currentTime : 0);
        updateDspButtonsUi();
    }

    function setPeqBandQ(bandIndex, qVal) {
        if (bandIndex < 0 || bandIndex >= PEQ_FREQS.length) return;
        const clampedQ = Math.max(0.4, Math.min(8.0, Number(qVal) || 1.41));
        peqQs[bandIndex] = clampedQ;
        try {
            safeStorage.setItem('cachymusic_peq_qs', JSON.stringify(peqQs));
        } catch (_) {}

        if (peqNodes && peqNodes[bandIndex] && audioContext) {
            peqNodes[bandIndex].Q.setTargetAtTime(clampedQ, audioContext.currentTime, 0.03);
        }
    }

    function setPeqPreset(name) {
        const presets = {
            flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            harman_in_ear: [4.5, 3.8, 2.0, 0.5, 0.0, 0.5, 1.8, 3.0, 1.5, 0.5],
            harman_over_ear: [3.5, 2.8, 1.2, 0.0, 0.0, 0.5, 2.2, 3.5, 2.0, 1.0],
            vocal: [-1.0, -0.5, 0.0, 1.0, 2.5, 3.2, 2.8, 1.5, 0.5, 0.0],
            bass_slam: [7.0, 5.5, 3.5, 1.0, 0.0, 0.0, 0.5, 1.0, 1.5, 0.5],
            acoustic: [2.0, 1.5, 1.0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5],
            treble_shimmer: [0.0, 0.0, 0.0, 0.5, 1.0, 1.5, 2.5, 3.8, 4.5, 5.0],
            vinyl_warmth: [3.5, 2.5, 1.5, 0.5, 0.0, -0.5, -1.0, -1.5, -2.5, -3.5],
            electronic: [6.0, 4.5, 2.0, 0.0, -0.5, 0.5, 1.5, 3.0, 3.5, 2.5],
            oratory_hd600: [5.2, 3.8, 1.5, -0.5, -0.8, 0.5, 1.2, -1.5, 2.0, 1.0]
        };
        const target = presets[String(name).toLowerCase()] || presets.flat;
        for (let i = 0; i < PEQ_FREQS.length; i++) {
            setPeqBandGain(i, target[i]);
        }
    }

    function importAutoEqProfile(text) {
        if (!text || typeof text !== 'string') return false;
        const lines = text.split(/\r?\n/);
        const parsedFilters = [];

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;

            const fcMatch = trimmed.match(/Fc\s+(\d+(?:\.\d+)?)\s*Hz/i);
            const gainMatch = trimmed.match(/Gain\s+([-+]?\d+(?:\.\d+)?)\s*dB/i);
            const qMatch = trimmed.match(/Q\s+(\d+(?:\.\d+)?)/i);

            if (fcMatch && gainMatch) {
                parsedFilters.push({
                    freq: parseFloat(fcMatch[1]),
                    gain: parseFloat(gainMatch[1]),
                    q: qMatch ? parseFloat(qMatch[1]) : 1.41
                });
            }
        }

        if (parsedFilters.length === 0) return false;

        const newGains = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        const newQs = [1.41, 1.41, 1.41, 1.41, 1.41, 1.41, 1.41, 1.41, 1.41, 1.41];
        for (let b = 0; b < PEQ_FREQS.length; b++) {
            const targetFreq = PEQ_FREQS[b];
            let matchingGain = 0;
            let matchingQ = 1.41;
            let bestRatioDist = 999;
            for (const f of parsedFilters) {
                const ratio = f.freq / targetFreq;
                const dist = Math.abs(Math.log2(ratio));
                if (dist < 0.65 && dist < bestRatioDist) {
                    bestRatioDist = dist;
                    matchingGain = f.gain;
                    matchingQ = f.q;
                }
            }
            newGains[b] = Math.max(-15, Math.min(15, matchingGain));
            newQs[b] = Math.max(0.4, Math.min(6.0, matchingQ));
        }

        for (let b = 0; b < PEQ_FREQS.length; b++) {
            setPeqBandGain(b, newGains[b]);
            setPeqBandQ(b, newQs[b]);
            const qBtn = document.getElementById(`peqFaderQ-${b}`);
            if (qBtn) qBtn.textContent = `Q ${newQs[b].toFixed(1)}`;
        }
        return true;
    }

    // Interactive Real-Time Response Curve Visualizer Canvas
    function drawPeqCurve() {
        const canvas = document.getElementById('peqCurveCanvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const dpr = Math.min(window.devicePixelRatio || 1, 3);
        const rect = canvas.getBoundingClientRect();
        if (!rect || rect.width < 16 || rect.height < 16) return;
        const w = rect.width;
        const h = rect.height;

        const targetW = Math.min(4096, Math.round(w * dpr));
        const targetH = Math.min(2048, Math.round(h * dpr));
        if (canvas.width !== targetW || canvas.height !== targetH) {
            canvas.width = targetW;
            canvas.height = targetH;
        }

        ctx.save();
        ctx.scale(targetW / w, targetH / h);
        ctx.clearRect(0, 0, w, h);

        const minFreq = 20;
        const maxFreq = 20000;
        const logMin = Math.log10(minFreq);
        const logMax = Math.log10(maxFreq);
        const minDb = -15;
        const maxDb = 15;
        const zeroY = h / 2;

        const freqToX = (f) => ((Math.log10(f) - logMin) / (logMax - logMin)) * w;
        const dbToY = (db) => zeroY - (db / maxDb) * (h * 0.42);

        const curTheme = getActiveTheme();
        const isLightCanvas = (curTheme === 'minimalist-light' || curTheme === 'brutalist-light' || curTheme === 'minimalist-warm');
        const isWarmTheme = (curTheme === 'minimalist-warm');

        // 1. Grid Lines
        ctx.lineWidth = 1;
        const gridFreqs = [50, 100, 250, 500, 1000, 2000, 4000, 8000, 16000];
        ctx.strokeStyle = isLightCanvas ? 'rgba(24, 24, 27, 0.16)' : 'rgba(226, 232, 240, 0.13)';
        ctx.fillStyle = isLightCanvas ? 'rgba(9, 9, 11, 0.88)' : 'rgba(241, 245, 249, 0.88)';
        ctx.font = '700 9.5px monospace';
        ctx.textAlign = 'center';

        gridFreqs.forEach(f => {
            const x = freqToX(f);
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, h);
            ctx.stroke();
            const lbl = f >= 1000 ? `${f / 1000}k` : `${f}`;
            if (x > 46 && x < w - 12) {
                ctx.fillText(lbl, x, h - 5);
            }
        });

        // Horizontal dB lines (+12, +6, 0, -6, -12)
        const dbs = [12, 6, 0, -6, -12];
        dbs.forEach(d => {
            const y = dbToY(d);
            ctx.beginPath();
            if (isLightCanvas) {
                ctx.strokeStyle = (d === 0) ? 'rgba(24, 24, 27, 0.40)' : 'rgba(24, 24, 27, 0.11)';
            } else {
                ctx.strokeStyle = (d === 0) ? 'rgba(248, 250, 252, 0.36)' : 'rgba(226, 232, 240, 0.09)';
            }
            ctx.moveTo(0, y);
            ctx.lineTo(w, y);
            ctx.stroke();
        });

        // 2. Calculate Combined Frequency Response H(f)
        const points = [];
        const numSteps = Math.min(300, Math.round(w));

        for (let s = 0; s <= numSteps; s++) {
            const x = (s / numSteps) * w;
            const freq = Math.pow(10, logMin + (x / w) * (logMax - logMin));
            let totalGain = 0;

            if (!isPeqBypassed) {
                for (let b = 0; b < PEQ_FREQS.length; b++) {
                    const g = peqGains[b];
                    if (g === 0) continue;
                    const f0 = PEQ_FREQS[b];
                    const ratio = freq / f0;
                    const Q = (peqQs && peqQs[b]) ? peqQs[b] : 1.414;
                    const weight = 1.0 / (1.0 + Math.pow(Q * (ratio - 1.0 / ratio), 2));
                    totalGain += g * weight;
                }
            }

            const y = dbToY(totalGain);
            points.push({ x, y, totalGain });
        }

        // 3. Gradient Fill Under Response Curve
        if (points.length > 0) {
            const grad = ctx.createLinearGradient(0, 0, 0, h);
            if (isWarmTheme) {
                grad.addColorStop(0, 'rgba(180, 83, 9, 0.24)');
                grad.addColorStop(0.5, 'rgba(180, 83, 9, 0.08)');
                grad.addColorStop(1, 'rgba(180, 83, 9, 0.01)');
            } else if (isLightCanvas) {
                grad.addColorStop(0, 'rgba(9, 9, 11, 0.20)');
                grad.addColorStop(0.5, 'rgba(9, 9, 11, 0.06)');
                grad.addColorStop(1, 'rgba(9, 9, 11, 0.01)');
            } else {
                grad.addColorStop(0, 'rgba(0, 229, 255, 0.28)');
                grad.addColorStop(0.5, 'rgba(0, 229, 255, 0.08)');
                grad.addColorStop(1, 'rgba(0, 229, 255, 0.01)');
            }

            ctx.beginPath();
            ctx.moveTo(points[0].x, zeroY);
            for (let i = 0; i < points.length; i++) {
                ctx.lineTo(points[i].x, points[i].y);
            }
            ctx.lineTo(w, zeroY);
            ctx.closePath();
            ctx.fillStyle = grad;
            ctx.fill();
        }

        // 4. Glowing Transfer Curve Line
        if (points.length > 0) {
            ctx.beginPath();
            ctx.moveTo(points[0].x, points[0].y);
            for (let i = 1; i < points.length; i++) {
                ctx.lineTo(points[i].x, points[i].y);
            }
            const activeStroke = isWarmTheme ? '#9a3412' : (isLightCanvas ? '#09090b' : (curTheme === 'minimalist-obsidian' ? '#38bdf8' : '#00e5ff'));
            const isFx = document.documentElement.classList.contains('is-firefox') || /firefox|fxios/i.test(navigator.userAgent || '');
            ctx.strokeStyle = isPeqBypassed ? '#dc2626' : activeStroke;
            ctx.lineWidth = 2.5;
            ctx.shadowColor = isPeqBypassed ? '#dc2626' : activeStroke;
            ctx.shadowBlur = isFx ? 0 : (isLightCanvas ? 2 : 3);
            ctx.stroke();
            ctx.shadowBlur = 0;
        }

        // 5. Center Frequency Nodes
        PEQ_FREQS.forEach((f0, b) => {
            const x = freqToX(f0);
            const g = isPeqBypassed ? 0 : peqGains[b];
            const y = dbToY(g);

            ctx.beginPath();
            ctx.arc(x, y, 4.5, 0, Math.PI * 2);
            if (isLightCanvas) {
                ctx.fillStyle = g !== 0 ? (isWarmTheme ? '#b45309' : '#047857') : '#ffffff';
                ctx.fill();
                ctx.strokeStyle = isWarmTheme ? '#1c1917' : '#09090b';
            } else {
                ctx.fillStyle = g !== 0 ? '#10b981' : '#ffffff';
                ctx.fill();
                ctx.strokeStyle = '#000000';
            }
            ctx.lineWidth = 1.5;
            ctx.stroke();
        });

        ctx.restore();
    }

    function initPeqWorkstation() {
        const peqGrid = document.getElementById('peqFadersGrid');
        const peqModal = document.getElementById('peqModal');
        const playerEqBtn = document.getElementById('playerPeqBtn');
        const closeBtn = document.getElementById('closePeqModalBtn');
        const bypassBtn = document.getElementById('peqBypassToggleBtn');
        const bypassText = document.getElementById('peqBypassStatusText');
        const resetBtn = document.getElementById('peqResetBtn');
        const presetSelect = document.getElementById('peqPresetSelect');
        const autoEqOpenBtn = document.getElementById('peqAutoEqOpenBtn');
        const autoEqDrawer = document.getElementById('peqAutoEqDrawer');
        const autoEqInput = document.getElementById('peqAutoEqInput');
        const autoEqApplyBtn = document.getElementById('peqAutoEqApplyBtn');
        const autoEqCancelBtn = document.getElementById('peqAutoEqCancelBtn');

        if (!peqGrid) return;

        function syncBipolarSliderFill(slider, val, minVal, maxVal) {
            if (!slider) return;
            const span = (maxVal - minVal) || 1;
            const pct = Math.max(0, Math.min(100, ((val - minVal) / span) * 100));
            slider.style.setProperty('--fill-low', `${Math.min(50, pct).toFixed(2)}%`);
            slider.style.setProperty('--fill-high', `${Math.max(50, pct).toFixed(2)}%`);
            slider.dataset.polarity = val > 0.01 ? 'boost' : (val < -0.01 ? 'cut' : 'flat');
        }

        // Populate 10 Tactile Vertical Faders
        peqGrid.innerHTML = '';
        PEQ_FREQS.forEach((freq, i) => {
            const col = document.createElement('div');
            col.className = 'peqFaderCol';
            const val = peqGains[i] || 0;
            const qVal = (peqQs && peqQs[i]) ? peqQs[i] : 1.41;
            const sign = val > 0 ? '+' : '';
            const dbClass = val > 0 ? 'boost' : (val < 0 ? 'cut' : '');
            const hzText = freq >= 1000 ? `${freq / 1000}k` : `${freq}`;

            col.innerHTML = `
                <span class="peqFaderDb ${dbClass}" id="peqFaderDb-${i}">${sign}${val.toFixed(1)}</span>
                <div class="peqFaderTrackCon">
                    <div class="peqFaderTrackZero"></div>
                    <input type="range" class="peqSlider" id="peqSlider-${i}" min="-15" max="15" step="0.5" value="${val}" aria-label="${hzText} Hz Band Gain" aria-orientation="vertical">
                </div>
                <span class="peqFaderHz">${hzText}</span>
                <button type="button" class="peqFaderQBtn" id="peqFaderQ-${i}" title="Click to adjust Q-Factor (Bandwidth) for ${hzText} Hz">${`Q ${qVal.toFixed(1)}`}</button>
            `;

            const slider = col.querySelector('.peqSlider');
            syncBipolarSliderFill(slider, val, -15, 15);
            slider.addEventListener('input', (e) => {
                const gain = parseFloat(e.target.value);
                setPeqBandGain(i, gain);
                syncBipolarSliderFill(slider, gain, -15, 15);
                const dbEl = document.getElementById(`peqFaderDb-${i}`);
                if (dbEl) {
                    const s = gain > 0 ? '+' : '';
                    dbEl.textContent = `${s}${gain.toFixed(1)}`;
                    dbEl.className = `peqFaderDb ${gain > 0 ? 'boost' : (gain < 0 ? 'cut' : '')}`;
                }
                drawPeqCurve();
            });
            slider.addEventListener('dblclick', () => {
                slider.value = 0;
                setPeqBandGain(i, 0);
                syncBipolarSliderFill(slider, 0, -15, 15);
                const dbEl = document.getElementById(`peqFaderDb-${i}`);
                if (dbEl) {
                    dbEl.textContent = '0.0';
                    dbEl.className = 'peqFaderDb';
                }
                drawPeqCurve();
            });

            const qBtn = col.querySelector('.peqFaderQBtn');
            if (qBtn) {
                qBtn.addEventListener('click', () => {
                    const curQ = peqQs[i] || 1.41;
                    let nextIdx = PEQ_Q_STEPS.findIndex(q => q > curQ + 0.05);
                    if (nextIdx === -1) nextIdx = 0;
                    const nextQ = PEQ_Q_STEPS[nextIdx];
                    setPeqBandQ(i, nextQ);
                    qBtn.textContent = `Q ${nextQ.toFixed(1)}`;
                    drawPeqCurve();
                });
            }

            peqGrid.appendChild(col);
        });

        function updateBypassUi() {
            if (bypassBtn) bypassBtn.classList.toggle('bypassed', isPeqBypassed);
            if (bypassText) bypassText.textContent = isPeqBypassed ? 'BYPASS' : 'ACTIVE';
            if (playerEqBtn) {
                const isPeqActive = !isPeqBypassed && peqGains.some(g => g !== 0);
                const activeDspCount = [isAmpBoost, isBassBoost, isVocalBoost, isTrebleBoost, isLimiter, isCrossfeed].filter(Boolean).length;
                playerEqBtn.classList.toggle('active', isPeqActive || activeDspCount > 0);
                const playerPeqBadge = document.getElementById('playerPeqBadge');
                if (playerPeqBadge) {
                    playerPeqBadge.textContent = isPeqActive ? 'ACTIVE' : '10-BAND';
                    playerPeqBadge.classList.toggle('active', isPeqActive);
                }
            }
        }
        updateBypassUi();

        if (bypassBtn) {
            bypassBtn.addEventListener('click', () => {
                isPeqBypassed = !isPeqBypassed;
                safeStorage.setItem('cachymusic_peq_bypassed', isPeqBypassed ? 'true' : 'false');
                updateBypassUi();
                for (let i = 0; i < PEQ_FREQS.length; i++) {
                    if (peqNodes[i] && audioContext) {
                        peqNodes[i].gain.setTargetAtTime(isPeqBypassed ? 0 : peqGains[i], audioContext.currentTime, 0.04);
                    }
                }
                updateAudioRouting();
                drawPeqCurve();
            });
        }

        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                for (let i = 0; i < PEQ_FREQS.length; i++) {
                    setPeqBandGain(i, 0);
                    setPeqBandQ(i, 1.41);
                    const slider = document.getElementById(`peqSlider-${i}`);
                    const dbEl = document.getElementById(`peqFaderDb-${i}`);
                    const qBtn = document.getElementById(`peqFaderQ-${i}`);
                    if (slider) {
                        slider.value = 0;
                        syncBipolarSliderFill(slider, 0, -15, 15);
                    }
                    if (dbEl) {
                        dbEl.textContent = '0.0';
                        dbEl.className = 'peqFaderDb';
                    }
                    if (qBtn) qBtn.textContent = 'Q 1.4';
                }
                if (presetSelect) presetSelect.value = 'flat';
                updateBypassUi();
                drawPeqCurve();
            });
        }

        // Stereo Balance & Pitch-Lock Controls inside Equalizer Workstation
        const balanceSlider = document.getElementById('peqStereoBalanceSlider');
        const balanceValueEl = document.getElementById('peqStereoBalanceValue');
        const balanceResetBtn = document.getElementById('peqBalanceResetBtn');
        const pitchLockBtn = document.getElementById('peqPitchLockBtn');

        function formatStereoBalanceText(bal) {
            const pct = Math.round(bal * 100);
            if (Math.abs(pct) <= 1) return 'CENTER';
            return pct < 0 ? `${Math.abs(pct)}% L` : `${pct}% R`;
        }

        if (balanceSlider) {
            const initBalPct = Math.round(stereoBalance * 100);
            balanceSlider.value = initBalPct;
            syncBipolarSliderFill(balanceSlider, initBalPct, -100, 100);
            if (balanceValueEl) balanceValueEl.textContent = formatStereoBalanceText(stereoBalance);
            balanceSlider.addEventListener('input', (e) => {
                const rawPct = parseInt(e.target.value, 10) || 0;
                stereoBalance = Math.max(-1.0, Math.min(1.0, rawPct / 100));
                syncBipolarSliderFill(balanceSlider, rawPct, -100, 100);
                safeStorage.setItem('cachymusic_stereo_balance', stereoBalance.toFixed(2));
                if (balanceValueEl) balanceValueEl.textContent = formatStereoBalanceText(stereoBalance);
                updateWorkletParams();
                updateAudioRouting();
            });
        }

        if (balanceResetBtn) {
            balanceResetBtn.addEventListener('click', () => {
                stereoBalance = 0;
                safeStorage.setItem('cachymusic_stereo_balance', '0');
                if (balanceSlider) {
                    balanceSlider.value = 0;
                    syncBipolarSliderFill(balanceSlider, 0, -100, 100);
                }
                if (balanceValueEl) balanceValueEl.textContent = formatStereoBalanceText(0);
                updateWorkletParams();
                updateAudioRouting();
            });
        }

        function applyAudioPitchLockMode() {
            if (!audio) return;
            try {
                audio.preservesPitch = isPitchLockTempo;
                audio.mozPreservesPitch = isPitchLockTempo;
                audio.webkitPreservesPitch = isPitchLockTempo;
            } catch (_) {}
            if (pitchLockBtn) {
                pitchLockBtn.textContent = isPitchLockTempo ? 'PITCH-LOCK TEMPO' : 'ANALOG VINYL PITCH';
                pitchLockBtn.classList.toggle('active', isPitchLockTempo);
            }
        }
        applyAudioPitchLockMode();

        if (pitchLockBtn) {
            pitchLockBtn.addEventListener('click', () => {
                isPitchLockTempo = !isPitchLockTempo;
                safeStorage.setItem('cachymusic_pitch_lock', isPitchLockTempo ? 'true' : 'false');
                applyAudioPitchLockMode();
                showToast(isPitchLockTempo ? 'Pitch-Lock Enabled: Independent Tempo' : 'Analog Vinyl Mode: Coupled Pitch + RPM');
            });
        }

        if (presetSelect) {
            presetSelect.addEventListener('change', () => {
                setPeqPreset(presetSelect.value);
                for (let i = 0; i < PEQ_FREQS.length; i++) {
                    const slider = document.getElementById(`peqSlider-${i}`);
                    const dbEl = document.getElementById(`peqFaderDb-${i}`);
                    const g = peqGains[i];
                    if (slider) {
                        slider.value = g;
                        syncBipolarSliderFill(slider, g, -15, 15);
                    }
                    if (dbEl) {
                        const s = g > 0 ? '+' : '';
                        dbEl.textContent = `${s}${g.toFixed(1)}`;
                        dbEl.className = `peqFaderDb ${g > 0 ? 'boost' : (g < 0 ? 'cut' : '')}`;
                    }
                }
                if (isPeqBypassed) {
                    isPeqBypassed = false;
                    safeStorage.setItem('cachymusic_peq_bypassed', 'false');
                    updateBypassUi();
                }
                drawPeqCurve();
            });
        }

        if (autoEqOpenBtn && autoEqDrawer) {
            autoEqOpenBtn.addEventListener('click', () => {
                const isOpen = autoEqDrawer.style.display !== 'none';
                autoEqDrawer.style.display = isOpen ? 'none' : 'flex';
                if (!isOpen && autoEqInput) setTimeout(() => autoEqInput.focus(), 50);
            });
        }

        if (autoEqCancelBtn && autoEqDrawer) {
            autoEqCancelBtn.addEventListener('click', () => {
                autoEqDrawer.style.display = 'none';
            });
        }

        if (autoEqApplyBtn && autoEqInput) {
            autoEqApplyBtn.addEventListener('click', () => {
                const text = autoEqInput.value.trim();
                if (text && importAutoEqProfile(text)) {
                    for (let i = 0; i < PEQ_FREQS.length; i++) {
                        const slider = document.getElementById(`peqSlider-${i}`);
                        const dbEl = document.getElementById(`peqFaderDb-${i}`);
                        const g = peqGains[i];
                        if (slider) {
                            slider.value = g;
                            syncBipolarSliderFill(slider, g, -15, 15);
                        }
                        if (dbEl) {
                            const s = g > 0 ? '+' : '';
                            dbEl.textContent = `${s}${g.toFixed(1)}`;
                            dbEl.className = `peqFaderDb ${g > 0 ? 'boost' : (g < 0 ? 'cut' : '')}`;
                        }
                    }
                    if (autoEqDrawer) autoEqDrawer.style.display = 'none';
                    if (isPeqBypassed) {
                        isPeqBypassed = false;
                        safeStorage.setItem('cachymusic_peq_bypassed', 'false');
                        updateBypassUi();
                    }
                    drawPeqCurve();
                }
            });
        }

        openPeqModal = function() {
            if (!peqModal) return;
            peqModal.style.display = 'flex';
            pushModalState('peqModal');
            drawPeqCurve();
            requestAnimationFrame(() => {
                drawPeqCurve();
                setTimeout(drawPeqCurve, 60);
            });
        };

        closePeqModal = function() {
            if (!peqModal) return;
            peqModal.style.display = 'none';
            popModalState('peqModal');
        };

        if (closeBtn) closeBtn.addEventListener('click', closePeqModal);

        if (peqModal) {
            peqModal.addEventListener('click', (e) => {
                if (e.target === peqModal) closePeqModal();
            });
        }

        window.addEventListener('resize', () => {
            if (peqModal && peqModal.style.display !== 'none') {
                drawPeqCurve();
            }
        }, { passive: true });

        setTimeout(drawPeqCurve, 100);
    }

    // AudioWorklet 64-Bit Processor Loader
    async function loadDspWorklet() {
        if (!audioContext || !audioContext.audioWorklet) return;
        const targetCtx = audioContext;
        try {
            await targetCtx.audioWorklet.addModule('scripts/dsp-worklet-processor.js?v=10.47&t=' + Date.now());
            if (!audioContext || audioContext !== targetCtx || targetCtx.state === 'closed') return;
            dspWorkletNode = new AudioWorkletNode(targetCtx, 'cachymusic-dsp-processor', {
                numberOfInputs: 1,
                numberOfOutputs: 1,
                outputChannelCount: [2]
            });
            dspWorkletNode.onprocessorerror = (err) => {
                console.warn('[AudioWorklet] Processor runtime error, falling back to native Web Audio graph:', err);
                dspWorkletNode = null;
                updateAudioRouting();
            };
            dspWorkletNode.port.onmessage = (e) => {
                if (e.data && e.data.type === 'agp_telemetry') {
                    const peqAgpStatus = document.getElementById('peqAgpStatus');
                    if (peqAgpStatus && isAgpEnabled) {
                        const gr = e.data.gainReductionDb;
                        peqAgpStatus.textContent = (gr < -0.1) ? `${gr.toFixed(1)} dB` : 'GUARD ON';
                    }
                }
            };
            updateWorkletParams();
            updateAudioRouting();
        } catch (e) {
            console.warn('[AudioWorklet] Fallback to native Web Audio graph:', e);
            dspWorkletNode = null;
            updateAudioRouting();
        }
    }

    function updateWorkletParams() {
        if (!dspWorkletNode || !dspWorkletNode.port) return;
        dspWorkletNode.port.postMessage({
            precision64: isPrecision64,
            agpEnabled: isAgpEnabled,
            subsonicEnabled: isSubsonic,
            ultrasonicEnabled: isUltrasonic,
            ultrasonicCutoff: ultrasonicCutoff,
            ditherMode: ditherMode,
            ambiophonicsEnabled: isAmbiophonics,
            phaseInvert: isPhaseInvert,
            monoMix: isMonoMix,
            stereoWidth: isSurroundWidener ? 1.35 : 1.0,
            stereoBalance: stereoBalance
        });
    }

    // Hardware Analog Gain (PipeWire / ALSA Bridge)
    let hwVolumeDebounceTimer = null;
    async function checkHardwareGainStatus() {
        try {
            const res = await fetch('php/api/hardware_volume.php?action=status');
            const data = await res.json();
            if (data && data.success) {
                hwVolumeBackend = data.backend;
                const pill = document.getElementById('settingsHardwareGainPill');
                const hwGainBtn = document.getElementById('settingsHwGainToggleBtn');
                const hwGainDot = document.getElementById('settingsHwGainDot');
                const hwGainText = document.getElementById('settingsHwGainText');
                if (pill) {
                    pill.textContent = data.available ? `READY (${data.backend.toUpperCase()})` : 'UNAVAILABLE';
                }
                if (!data.available) {
                    isHardwareGain = false;
                    if (hwGainBtn) {
                        hwGainBtn.disabled = true;
                        hwGainBtn.classList.add('disabled');
                        hwGainBtn.classList.remove('active');
                        hwGainBtn.setAttribute('aria-disabled', 'true');
                        hwGainBtn.title = 'Hardware Analog Gain is unavailable on this platform or output interface.';
                    }
                    if (hwGainDot) hwGainDot.classList.remove('active');
                    if (hwGainText) hwGainText.textContent = 'HARDWARE GAIN: UNAVAILABLE';
                } else {
                    if (hwGainBtn) {
                        hwGainBtn.disabled = false;
                        hwGainBtn.classList.remove('disabled');
                        hwGainBtn.removeAttribute('aria-disabled');
                        hwGainBtn.title = 'Direct PipeWire/ALSA physical volume bridge.';
                    }
                    if (hwGainText && isHardwareGain) {
                        hwGainText.textContent = `HARDWARE GAIN: ON (${data.backend.toUpperCase()})`;
                    }
                }
                if (isHardwareGain && data.available && typeof data.volume === 'number') {
                    currentVolumeValue = Math.max(0, Math.min(1.5, data.volume));
                    if (volumeSlider) volumeSlider.value = currentVolumeValue;
                    if (miniVolumeSlider) miniVolumeSlider.value = Math.min(1.0, currentVolumeValue);
                    if (volumeLevel) {
                        const pct = Math.round(currentVolumeValue * 100);
                        volumeLevel.textContent = currentVolumeValue > 1.0 ? `${pct}% HW-AMP` : `${pct}%`;
                    }
                    updateVolumeIcon(Math.min(1.0, currentVolumeValue));
                    if (audio) {
                        audio.volume = 1.0; // 0 dBFS unscaled bit-perfect pass-through
                        audio.muted = data.muted || false;
                    }
                }
            } else {
                markHwGainUnavailable();
            }
        } catch (_) {
            markHwGainUnavailable();
        }
    }

    function markHwGainUnavailable() {
        isHardwareGain = false;
        const pill = document.getElementById('settingsHardwareGainPill');
        const hwGainBtn = document.getElementById('settingsHwGainToggleBtn');
        const hwGainDot = document.getElementById('settingsHwGainDot');
        const hwGainText = document.getElementById('settingsHwGainText');
        if (pill) pill.textContent = 'UNAVAILABLE';
        if (hwGainBtn) {
            hwGainBtn.disabled = true;
            hwGainBtn.classList.add('disabled');
            hwGainBtn.classList.remove('active');
            hwGainBtn.setAttribute('aria-disabled', 'true');
            hwGainBtn.title = 'Hardware Analog Gain is unavailable on this platform or output interface.';
        }
        if (hwGainDot) hwGainDot.classList.remove('active');
        if (hwGainText) hwGainText.textContent = 'HARDWARE GAIN: UNAVAILABLE';
    }

    function dispatchHardwareVolume(vol) {
        if (!isHardwareGain) return;
        if (hwVolumeDebounceTimer) clearTimeout(hwVolumeDebounceTimer);
        hwVolumeDebounceTimer = setTimeout(() => {
            fetch('php/api/hardware_volume.php?action=set_volume', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ volume: vol })
            }).catch(() => {});
        }, 35);
    }

    // Neutron HiFi™ Settings Controls Wiring
    function setupNeutronSettingsControls() {
        const applyAudioBtn = document.getElementById('settingsApplyAudioBtn');
        const applyAudioStatus = document.getElementById('settingsApplyAudioStatus');
        let pendingAudioChanges = 0;

        function markAudioSettingsPending(name, val) {
            pendingAudioChanges++;
            if (applyAudioBtn) {
                applyAudioBtn.textContent = `APPLY AUDIO SETTINGS (${pendingAudioChanges} PENDING)`;
                applyAudioBtn.style.boxShadow = '0 0 16px var(--accent-glow, rgba(0,240,255,0.4))';
            }
            if (applyAudioStatus) {
                applyAudioStatus.textContent = `Pending: ${name} (${val}). Click Apply to activate.`;
                applyAudioStatus.style.color = 'var(--accent-primary, #38bdf8)';
            }
        }

        // 1. Math Precision Architecture
        const precisionBtns = document.querySelectorAll('.enginePrecisionBtn');
        const precisionPill = document.getElementById('settingsEnginePrecisionPill');
        const updatePrecisionUi = () => {
            precisionBtns.forEach(b => {
                const is64 = b.getAttribute('data-precision') === '64';
                b.classList.toggle('active', is64 === isPrecision64);
            });
            if (precisionPill) {
                precisionPill.textContent = isPrecision64 ? '64-BIT DOUBLE FLOAT' : '32-BIT FAST FLOAT';
            }
        };
        updatePrecisionUi();
        precisionBtns.forEach(b => {
            b.addEventListener('click', () => {
                isPrecision64 = b.getAttribute('data-precision') === '64';
                safeStorage.setItem('cachymusic_precision_64', isPrecision64 ? 'true' : 'false');
                safeStorage.setItem('cachymusic_engine_precision', isPrecision64 ? '64' : '32');
                updatePrecisionUi();
                updateWorkletParams();
                updateSignalPathUi();
                markAudioSettingsPending('Math Precision', isPrecision64 ? '64-Bit Studio Float' : '32-Bit Fast Float');
                showToast(`Precision Engine: ${isPrecision64 ? '64-Bit Studio Float' : '32-Bit Fast Float'}`);
            });
        });

        // 2. Hardware Analog Gain (PipeWire / ALSA)
        const hwGainBtn = document.getElementById('settingsHwGainToggleBtn');
        const hwGainDot = document.getElementById('settingsHwGainDot');
        const hwGainText = document.getElementById('settingsHwGainText');
        const updateHwGainUi = () => {
            if (hwGainBtn) hwGainBtn.classList.toggle('active', isHardwareGain);
            if (hwGainDot) hwGainDot.classList.toggle('active', isHardwareGain);
            if (hwGainText) {
                hwGainText.textContent = isHardwareGain ? `HARDWARE GAIN: ON (${hwVolumeBackend.toUpperCase()})` : 'HARDWARE GAIN: OFF';
            }
        };
        updateHwGainUi();
        if (hwGainBtn) {
            hwGainBtn.addEventListener('click', async () => {
                if (hwGainBtn.disabled || hwGainBtn.classList.contains('disabled')) return;
                isHardwareGain = !isHardwareGain;
                safeStorage.setItem('cachymusic_hardware_gain', isHardwareGain ? 'true' : 'false');
                safeStorage.setItem('cachymusic_hw_gain', isHardwareGain ? 'true' : 'false');
                updateHwGainUi();
                if (isHardwareGain) {
                    await checkHardwareGainStatus();
                    updateHwGainUi();
                    showToast('Hardware Analog Gain Enabled (0 dBFS Bit-Perfect DAC Stream)');
                } else {
                    if (audio) {
                        audio.volume = Math.min(1.0, currentVolumeValue);
                    }
                    showToast('Hardware Analog Gain Disabled (Digital Volume)');
                }
                updateSignalPathUi();
            });
        }

        // 3. Ultrasonic IMD Filter
        const ultrasonicBtn = document.getElementById('settingsUltrasonicToggleBtn');
        const ultrasonicDot = document.getElementById('settingsUltrasonicDot');
        const ultrasonicText = document.getElementById('settingsUltrasonicText');
        const ultrasonicSelect = document.getElementById('settingsUltrasonicCutoffSelect');
        const ultrasonicPill = document.getElementById('settingsUltrasonicPill');
        const updateUltrasonicUi = () => {
            if (ultrasonicBtn) ultrasonicBtn.classList.toggle('active', isUltrasonic);
            if (ultrasonicDot) ultrasonicDot.classList.toggle('active', isUltrasonic);
            if (ultrasonicText) {
                ultrasonicText.textContent = isUltrasonic ? 'ULTRASONIC FILTER: ON' : 'ULTRASONIC FILTER: OFF';
            }
            if (ultrasonicPill) {
                ultrasonicPill.textContent = isUltrasonic ? `ACTIVE (${Math.round(ultrasonicCutoff / 1000)} kHz)` : 'BYPASS';
            }
            if (ultrasonicSelect) {
                ultrasonicSelect.value = ultrasonicCutoff.toString();
            }
        };
        updateUltrasonicUi();
        if (ultrasonicBtn) {
            ultrasonicBtn.addEventListener('click', () => {
                isUltrasonic = !isUltrasonic;
                safeStorage.setItem('cachymusic_ultrasonic', isUltrasonic ? 'true' : 'false');
                updateUltrasonicUi();
                updateWorkletParams();
                updateAudioRouting();
                updateSignalPathUi();
                markAudioSettingsPending('Ultrasonic Filter', isUltrasonic ? 'Active (' + Math.round(ultrasonicCutoff / 1000) + ' kHz)' : 'Bypassed');
                showToast(`Ultrasonic IMD Filter: ${isUltrasonic ? 'Active (' + Math.round(ultrasonicCutoff / 1000) + ' kHz)' : 'Bypassed'}`);
            });
        }
        if (ultrasonicSelect) {
            ultrasonicSelect.addEventListener('change', () => {
                ultrasonicCutoff = parseInt(ultrasonicSelect.value, 10) || 32000;
                safeStorage.setItem('cachymusic_ultrasonic_cutoff', ultrasonicCutoff.toString());
                updateUltrasonicUi();
                updateWorkletParams();
                updateSignalPathUi();
                markAudioSettingsPending('Ultrasonic Cutoff', `${Math.round(ultrasonicCutoff / 1000)} kHz`);
                showToast(`Ultrasonic Cutoff: ${Math.round(ultrasonicCutoff / 1000)} kHz`);
            });
        }

        // 4. Dithering & Noise Shaping
        const ditherBtns = document.querySelectorAll('.ditherModeBtn');
        const ditherPill = document.getElementById('settingsDitherPill');
        const updateDitherUi = () => {
            ditherBtns.forEach(b => {
                const mode = b.getAttribute('data-dither');
                b.classList.toggle('active', mode === ditherMode);
            });
            if (ditherPill) {
                ditherPill.textContent = ditherMode === 'shaped' ? 'SHAPED (>18 kHz)' : (ditherMode === 'tpdf' ? 'TPDF FLAT' : 'OFF (TRUNCATE)');
            }
        };
        updateDitherUi();
        ditherBtns.forEach(b => {
            b.addEventListener('click', () => {
                ditherMode = b.getAttribute('data-dither') || 'shaped';
                safeStorage.setItem('cachymusic_dither_mode', ditherMode);
                updateDitherUi();
                updateWorkletParams();
                updateAudioRouting();
                updateSignalPathUi();
                markAudioSettingsPending('Dither Mode', ditherMode === 'shaped' ? 'Psychoacoustic Shaped' : (ditherMode === 'tpdf' ? 'TPDF Flat' : 'Off'));
                showToast(`Dither: ${ditherMode === 'shaped' ? 'Psychoacoustic Shaped' : (ditherMode === 'tpdf' ? 'TPDF Flat' : 'Off')}`);
            });
        });

        // 5. Speaker Ambiophonics R.A.C.E.
        const ambiBtn = document.getElementById('settingsAmbiToggleBtn');
        const ambiDot = document.getElementById('settingsAmbiDot');
        const ambiText = document.getElementById('settingsAmbiText');
        const ambiPill = document.getElementById('settingsAmbiPill');
        const updateAmbiUi = () => {
            if (ambiBtn) ambiBtn.classList.toggle('active', isAmbiophonics);
            if (ambiDot) ambiDot.classList.toggle('active', isAmbiophonics);
            if (ambiText) {
                ambiText.textContent = isAmbiophonics ? 'AMBIOPHONICS: ON (R.A.C.E.)' : 'AMBIOPHONICS: OFF (SPEAKERS ONLY)';
            }
            if (ambiPill) {
                ambiPill.textContent = isAmbiophonics ? 'ACTIVE (R.A.C.E.)' : 'BYPASS';
            }
        };
        updateAmbiUi();
        if (ambiBtn) {
            ambiBtn.addEventListener('click', () => {
                isAmbiophonics = !isAmbiophonics;
                safeStorage.setItem('cachymusic_ambiophonics', isAmbiophonics ? 'true' : 'false');
                updateAmbiUi();
                updateWorkletParams();
                updateAudioRouting();
                updateSignalPathUi();
                markAudioSettingsPending('Speaker Ambiophonics', isAmbiophonics ? 'Enabled (Speakers Only)' : 'Disabled');
                showToast(`Speaker Ambiophonics: ${isAmbiophonics ? 'Enabled (Speakers Only)' : 'Disabled'}`);
            });
        }

        // 6. Audio Buffer & Latency Tuning
        const bufferBtns = document.querySelectorAll('.bufferLatencyBtn');
        const bufferPill = document.getElementById('settingsBufferPill');
        const updateBufferUi = () => {
            bufferBtns.forEach(b => {
                const latency = b.getAttribute('data-latency');
                b.classList.toggle('active', latency === bufferLatencyTarget);
            });
            if (bufferPill) {
                bufferPill.textContent = bufferLatencyTarget === 'interactive' ? 'STUDIO LOW-LATENCY (~15ms)' : 'PLAYBACK (~100ms)';
            }
        };
        updateBufferUi();
        bufferBtns.forEach(b => {
            b.addEventListener('click', () => {
                const newLatency = b.getAttribute('data-latency') || 'playback';
                if (newLatency === bufferLatencyTarget) return;
                bufferLatencyTarget = newLatency;
                safeStorage.setItem('cachymusic_buffer_latency', bufferLatencyTarget);
                updateBufferUi();
                updateWorkletParams();
                updateSignalPathUi();
                markAudioSettingsPending('Buffer Latency', newLatency === 'interactive' ? 'Low Latency (~15ms)' : 'Stable (~100ms)');
                showToast(`Audio Buffer Calibrated: ${newLatency === 'interactive' ? 'Low Latency (~15ms)' : 'Stable Playback (~100ms)'}`);
            });
        });

        // 7. Settings Confirmation & Apply Action Handler
        if (applyAudioBtn) {
            applyAudioBtn.addEventListener('click', () => {
                pendingAudioChanges = 0;
                applyAudioBtn.textContent = 'APPLY AUDIO SETTINGS';
                applyAudioBtn.style.boxShadow = '';
                if (applyAudioStatus) {
                    applyAudioStatus.textContent = 'All audio settings applied successfully & active.';
                    applyAudioStatus.style.color = '#10b981';
                }
                updateWorkletParams();
                updateAudioRouting();
                updateSignalPathUi();
                if (typeof showCachyToast === 'function') {
                    showCachyToast('Settings Applied', 'Audio & DSP configuration applied successfully.', 'success');
                } else {
                    showToast('Settings Applied Successfully');
                }
                logAudioPlaybackEvent('info', 'User confirmed and applied audio DSP settings.');
            });
        }

        // 8. Playback Diagnostics & Debug Log Actions
        const copyDebugBtn = document.getElementById('settingsCopyDebugLogBtn');
        const clearDebugBtn = document.getElementById('settingsClearDebugLogBtn');
        if (copyDebugBtn) {
            copyDebugBtn.addEventListener('click', () => {
                const logs = window.audioPlaybackDebugLogs && window.audioPlaybackDebugLogs.length > 0
                    ? window.audioPlaybackDebugLogs.join('\n')
                    : 'No telemetry events logged yet.';
                navigator.clipboard.writeText(logs).then(() => {
                    showToast('Playback Diagnostics Copied');
                }).catch(() => {
                    showToast('Could not copy diagnostics.');
                });
            });
        }
        if (clearDebugBtn) {
            clearDebugBtn.addEventListener('click', () => {
                window.audioPlaybackDebugLogs = [];
                const logBox = document.getElementById('settingsAudioDebugLog');
                if (logBox) logBox.textContent = '[AudioEngine] Diagnostics log cleared.';
                consecutiveSkipCount = 0;
                updateAudioDiagnosticsUi();
                showToast('Diagnostics Log Cleared');
            });
        }

        // 9. On-Screen Audio Diagnostics & Debug Mode Controls
        const debugEnableBtn = document.getElementById('debugModeEnableBtn');
        const debugDisableBtn = document.getElementById('debugModeDisableBtn');
        if (debugEnableBtn) {
            debugEnableBtn.addEventListener('click', () => {
                setDebugMode(true);
                markAudioSettingsPending('Debug Mode', 'Enabled');
            });
        }
        if (debugDisableBtn) {
            debugDisableBtn.addEventListener('click', () => {
                setDebugMode(false);
                markAudioSettingsPending('Debug Mode', 'Disabled');
            });
        }

        const hudClearBtn = document.getElementById('debugHudClearBtn');
        const hudCopyBtn = document.getElementById('debugHudCopyBtn');
        const hudCloseBtn = document.getElementById('debugHudCloseBtn');
        if (hudClearBtn) {
            hudClearBtn.addEventListener('click', () => {
                window.audioPlaybackDebugLogs = [];
                const logList = document.getElementById('debugHudLogList');
                if (logList) logList.innerHTML = '<div class="debugHudLogEntry system">[SYSTEM] Debug telemetry cleared.</div>';
                const logBox = document.getElementById('settingsAudioDebugLog');
                if (logBox) logBox.textContent = '';
                consecutiveSkipCount = 0;
                updateAudioDiagnosticsUi();
            });
        }
        if (hudCopyBtn) {
            hudCopyBtn.addEventListener('click', () => {
                const logs = window.audioPlaybackDebugLogs && window.audioPlaybackDebugLogs.length > 0
                    ? window.audioPlaybackDebugLogs.join('\n')
                    : 'No telemetry events logged yet.';
                navigator.clipboard.writeText(logs).then(() => {
                    if (typeof showCachyToast === 'function') {
                        showCachyToast('Copied', 'Debug telemetry log copied to clipboard.', 'success');
                    }
                }).catch(() => {
                    if (typeof showCachyToast === 'function') {
                        showCachyToast('Clipboard Error', 'Could not copy diagnostics to clipboard.', 'warning');
                    }
                });
            });
        }
        if (hudCloseBtn) {
            hudCloseBtn.addEventListener('click', () => setDebugMode(false));
        }

        // Make Diagnostics HUD Draggable by Header
        const hudEl = document.getElementById('debugHudContainer');
        const hudHeaderEl = hudEl ? hudEl.querySelector('.debugHudHeader') : null;
        if (hudEl && hudHeaderEl) {
            let isDragging = false;
            let startPointerX = 0;
            let startPointerY = 0;
            let startLeft = 0;
            let startTop = 0;

            const headerBtns = hudHeaderEl.querySelectorAll('button');
            headerBtns.forEach(btn => {
                btn.addEventListener('pointerdown', (e) => e.stopPropagation());
            });

            hudHeaderEl.addEventListener('pointerdown', (e) => {
                if (e.button !== 0) return;
                isDragging = true;
                try {
                    hudHeaderEl.setPointerCapture(e.pointerId);
                } catch (_) {}
                const rect = hudEl.getBoundingClientRect();
                startPointerX = e.clientX;
                startPointerY = e.clientY;
                startLeft = rect.left;
                startTop = rect.top;

                hudEl.style.bottom = 'auto';
                hudEl.style.transform = 'none';
                hudEl.style.left = `${startLeft}px`;
                hudEl.style.top = `${startTop}px`;
            });

            hudHeaderEl.addEventListener('pointermove', (e) => {
                if (!isDragging) return;
                const dx = e.clientX - startPointerX;
                const dy = e.clientY - startPointerY;
                const rect = hudEl.getBoundingClientRect();
                const maxLeft = Math.max(0, window.innerWidth - rect.width);
                const maxTop = Math.max(0, window.innerHeight - rect.height);
                const newLeft = Math.max(0, Math.min(maxLeft, startLeft + dx));
                const newTop = Math.max(0, Math.min(maxTop, startTop + dy));
                hudEl.style.left = `${newLeft}px`;
                hudEl.style.top = `${newTop}px`;
            });

            const stopDrag = (e) => {
                if (!isDragging) return;
                isDragging = false;
                try {
                    hudHeaderEl.releasePointerCapture(e.pointerId);
                } catch (_) {}
            };
            hudHeaderEl.addEventListener('pointerup', stopDrag);
            hudHeaderEl.addEventListener('pointercancel', stopDrag);
        }

        // DAC Capability Detection & Feature Gating
        async function checkDacCapabilities() {
            let hasDac = false;
            let dacLabel = '';
            try {
                if (audioContext && audioContext.sampleRate > 48000) {
                    hasDac = true;
                    dacLabel = `${Math.round(audioContext.sampleRate / 1000)}kHz Hi-Res Interface`;
                }
                if (!hasDac && navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
                    const devices = await navigator.mediaDevices.enumerateDevices();
                    const dacDev = devices.find(d => 
                        d.kind === 'audiooutput' && 
                        /dac|hi-?res|headphone|usb|external|interface|fiio|topping|schiit|audioquest|chord/i.test(d.label)
                    );
                    if (dacDev) {
                        hasDac = true;
                        dacLabel = dacDev.label || 'Connected DAC';
                    }
                }
            } catch (_) {}

            const dacBtn = document.getElementById('dacShapedDitherBtn');
            const dacPill = document.getElementById('settingsDacRequiredPill');
            if (dacBtn) {
                if (hasDac) {
                    dacBtn.removeAttribute('disabled');
                    dacBtn.classList.remove('disabled');
                    dacBtn.setAttribute('title', `Active DAC detected: ${dacLabel}`);
                } else {
                    dacBtn.setAttribute('disabled', 'true');
                    dacBtn.classList.add('disabled');
                    dacBtn.setAttribute('title', 'Requires connected USB DAC or high-res audio interface (96kHz+)');
                    if (ditherMode === 'shaped') {
                        ditherMode = 'tpdf';
                        try {
                            safeStorage.setItem('cachymusic_dither_mode', 'tpdf');
                        } catch (_) {}
                        const ditherBtns = document.querySelectorAll('.ditherModeBtn');
                        ditherBtns.forEach(b => {
                            b.classList.toggle('active', b.getAttribute('data-dither') === 'tpdf');
                        });
                        const ditherPillEl = document.getElementById('settingsDitherPill');
                        if (ditherPillEl) ditherPillEl.textContent = 'TPDF FLAT';
                    }
                }
            }
            if (dacPill) {
                dacPill.textContent = hasDac ? 'DAC READY' : 'REQUIRES DAC';
                dacPill.classList.toggle('active', hasDac);
            }
        }
        checkDacCapabilities();
        if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
            navigator.mediaDevices.addEventListener('devicechange', checkDacCapabilities);
        }

        // Ensure sleep timer cancel button is hidden initially if no timer is active
        const initCancelSleepBtn = document.getElementById('settingsTabCancelSleepBtn');
        if (initCancelSleepBtn && !sleepTimerMode) {
            initCancelSleepBtn.style.display = 'none';
        }

        if (typeof updateDebugHudState === 'function') {
            updateDebugHudState();
        }

        // 7. Settings Category Sub-Navigation Filter Bar (Balanced 2-Column Sub-Groupings)
        const catBtns = document.querySelectorAll('#settingsCategoryNav .settingsCatBtn');
        const settingsGrid = document.getElementById('settingsLayoutGrid');
        if (catBtns.length > 0 && settingsGrid) {
            const applySettingsCategory = (cat) => {
                catBtns.forEach(b => b.classList.toggle('active', b.getAttribute('data-cat') === cat));
                settingsGrid.setAttribute('data-active-cat', cat);

                const audioCol = document.getElementById('settingsColAudio');
                const sysCol = document.getElementById('settingsColSystem');
                if (audioCol) audioCol.style.display = '';
                if (sysCol) sysCol.style.display = '';

                const panels = settingsGrid.querySelectorAll('.settingsSectionPanel[data-settings-cat]');
                panels.forEach(panel => {
                    const panelCats = (panel.getAttribute('data-settings-cat') || '').split(/\s+/);
                    const isMatch = (cat === 'all') || panelCats.includes(cat);
                    panel.style.display = isMatch ? '' : 'none';
                });
            };

            catBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    const cat = btn.getAttribute('data-cat') || 'audio';
                    try { safeStorage.setItem('cachymusic_settings_cat', cat); } catch (_) {}
                    applySettingsCategory(cat);
                });
            });

            const urlParams = new URLSearchParams(window.location.search);
            const urlCat = urlParams.get('cat');
            const savedCat = urlCat || safeStorage.getItem('cachymusic_settings_cat') || 'audio';
            applySettingsCategory(savedCat);
        }
    }

    function toggleReplayGain(active) {
        isReplayGain = typeof active === 'boolean' ? active : !isReplayGain;
        try {
            safeStorage.setItem('cachymusic_replaygain', isReplayGain ? 'true' : 'false');
        } catch (_) {}
        const curTrack = allTracks[currentTrackIndex];
        if (curTrack && replayGainNode && audioContext) {
            let targetGain = (isReplayGain && typeof curTrack.replayGain === 'number' && !isNaN(curTrack.replayGain))
                ? Math.pow(10, curTrack.replayGain / 20)
                : 1.0;
            if (isReplayGain && typeof curTrack.replayPeak === 'number' && curTrack.replayPeak > 0 && (targetGain * curTrack.replayPeak) > 0.965) {
                targetGain = 0.965 / curTrack.replayPeak; // -0.31 dBFS true-peak safety ceiling
            }
            replayGainNode.gain.setTargetAtTime(targetGain, audioContext.currentTime, 0.04);
        }
        updateDacStatusUi();
    }

    function setVolume(val, updateInput = false) {
        if (typeof val !== 'number' || isNaN(val) || !isFinite(val)) {
            val = 0.8;
        }
        currentVolumeValue = Math.max(0, Math.min(1.5, val));
        safeStorage.setItem('cachymusic_volume', currentVolumeValue.toString());
        if (updateInput && volumeSlider) {
            volumeSlider.value = currentVolumeValue;
        }
        if (miniVolumeSlider) {
            miniVolumeSlider.value = Math.min(1.0, currentVolumeValue);
        }

        if (isHardwareGain) {
            // Bit-Perfect Hardware Analog Gain: Keep software digital stream at 0 dBFS full precision
            audio.volume = 1.0;
            audio.muted = false;
            dispatchHardwareVolume(currentVolumeValue);
        } else {
            // Standard HTML5 audio.volume clamped to [0.0, 1.0]
            const baseVol = Math.min(1.0, currentVolumeValue);
            audio.volume = baseVol;
            audio.muted = false;

            if (audioContext) {
                const now = audioContext.currentTime;
                updateAmpGain(now);
                updateLimiterState(now);
                updateAudioRouting();
            }
        }

        const pct = Math.round(currentVolumeValue * 100);
        if (currentVolumeValue > 1.0) {
            volumeLevel.textContent = isHardwareGain ? `${pct}% HW-AMP` : `${pct}% AMP`;
            volumeLevel.classList.add('amplified');
            volumeLevel.setAttribute('title', isHardwareGain ? `Hardware Analog Gain: ${pct}%` : `Volume: 100% + Clean Amplification: ${pct - 100}%`);
        } else {
            volumeLevel.textContent = `${pct}%`;
            volumeLevel.classList.remove('amplified');
            volumeLevel.removeAttribute('title');
        }
        updateVolumeIcon(Math.min(1.0, currentVolumeValue));
    }


    // =========================================================================
    // High-Fidelity Audio Visualizer Engine
    // 60-band perceptual log binning, dual-stage smoothing, 3 reworked modes
    // =========================================================================


    function initDspNodes() {
        if (!audioContext) return;
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 2048; // 1024 frequency bins for full 0Hz - 24,000Hz (24kHz) Nyquist spectrum fidelity
        analyser.smoothingTimeConstant = 0.38; // Highly responsive FFT buffer: captures musical transient spikes without lag
        analyser.minDecibels = -90; // Wide dynamic range captures delicate high-frequency air, harmonics & cymbals above 16kHz
        analyser.maxDecibels = -25;

        // -1. Subsonic High-Pass Filter: Infrasonic rumble eliminator at 20 Hz (Butterworth Q=0.707)
        subsonicFilter = audioContext.createBiquadFilter();
        subsonicFilter.type = 'highpass';
        subsonicFilter.frequency.value = isSubsonic ? 20 : 5;
        subsonicFilter.Q.value = 0.707;

        // 0. ReplayGain / EBU R128 Loudness Normalization Stage
        replayGainNode = audioContext.createGain();
        replayGainNode.gain.value = 1.0;

        // 0.5. Dynamic Headroom Pre-Amp Gain Stage
        preAmpGainNode = audioContext.createGain();
        preAmpGainNode.gain.value = getPreAmpGainValue();

        // 0.8. Bauer Headphone Crossfeed Network (Meier / Bauer Acoustic HRTF Simulation)
        xfeedNetwork = createCrossfeedNetwork(audioContext);

        // 10-Band Parametric Equalizer (ISO standard 1-octave frequencies from 31 Hz to 16 kHz)
        peqNodes = PEQ_FREQS.map((freq, i) => {
            const f = audioContext.createBiquadFilter();
            if (i === 0) f.type = 'lowshelf';
            else if (i === PEQ_FREQS.length - 1) f.type = 'highshelf';
            else f.type = 'peaking';
            f.frequency.value = freq;
            f.Q.value = (peqQs && typeof peqQs[i] === 'number') ? peqQs[i] : 1.41;
            f.gain.value = (peqGains && typeof peqGains[i] === 'number' && !isPeqBypassed) ? peqGains[i] : 0;
            return f;
        });

        // 1. Bass Boost Filter: Low-shelf filter at 95 Hz (+3.8 dB Harman sub-bass target)
        bassFilter = audioContext.createBiquadFilter();
        bassFilter.type = 'lowshelf';
        bassFilter.frequency.value = 95;
        bassFilter.gain.value = isBassBoost ? 3.8 : 0;

        // 2. Vocal Boost Filter: Peaking bandpass at 3000 Hz (+2.8 dB Pinna Ear-Gain presence)
        vocalFilter = audioContext.createBiquadFilter();
        vocalFilter.type = 'peaking';
        vocalFilter.frequency.value = 3000;
        vocalFilter.Q.value = 1.2;
        vocalFilter.gain.value = isVocalBoost ? 2.8 : 0;

        // 3. Treble Boost Filter: High-shelf filter at 10000 Hz (+3.0 dB Air Band & high shimmer)
        trebleFilter = audioContext.createBiquadFilter();
        trebleFilter.type = 'highshelf';
        trebleFilter.frequency.value = 10000;
        trebleFilter.gain.value = isTrebleBoost ? 3.0 : 0;

        // 4. Clean Amplification Gain Stage (raw unconstrained gain)
        ampGainNode = audioContext.createGain();
        ampGainNode.gain.value = isAmpBoost ? getEffectiveAmplification() : 1.0;

        // 5. Dedicated Studio-Grade Transparent Brickwall Limiter (Master anti-clipping protection)
        dspLimiter = audioContext.createDynamicsCompressor();
        const initProfile = computeLimiterProfile();
        if (isLimiter && !initProfile.isBypassed) {
            dspLimiter.threshold.value = initProfile.threshold;
            dspLimiter.knee.value = initProfile.knee;
            dspLimiter.ratio.value = initProfile.ratio;
            dspLimiter.attack.value = initProfile.attack;
            dspLimiter.release.value = initProfile.release;
        } else {
            dspLimiter.threshold.value = 0;
            dspLimiter.knee.value = 0;
            dspLimiter.ratio.value = 1.0;
            dspLimiter.attack.value = 0.0018;
            dspLimiter.release.value = 0.090;
        }

        // 6. True Peak Output Ceiling Stage (-0.6 dBFS anti-clipping ceiling for DAC reconstruction)
        ceilingTrimGain = audioContext.createGain();
        ceilingTrimGain.gain.value = isLimiter ? Math.pow(10, -0.6 / 20) : 1.0;

        // 7. Analog Soft-Clipper (Smooth hyperbolic tangent curve prevents harsh square-wave DAC clipping)
        ampSoftClipper = audioContext.createWaveShaper();
        ampSoftClipper.curve = isLimiter ? createSoftClipCurve(2048) : createLinearCurve(2048);
        // Adaptive oversampling: Hi-Res audio (>= 88.2 kHz) already has ultra-high Nyquist headroom (44.1+ kHz bandwidth),
        // so 2x oversampling is redundant and overloads the audio rendering thread (192,000+ samples/sec).
        ampSoftClipper.oversample = (audioContext.sampleRate >= 88200) ? 'none' : '2x';
    }

    function resetMediaElementForNewAudioContext() {
        if (!audio) return;
        const oldAudio = audio;
        oldAudio._isDisposed = true;
        try {
            oldAudio.pause();
            oldAudio.onplay = null;
            oldAudio.onplaying = null;
            oldAudio.onpause = null;
            oldAudio.onerror = null;
            oldAudio.onended = null;
            oldAudio.ontimeupdate = null;
            oldAudio.onwaiting = null;
            oldAudio.onstalled = null;
            oldAudio.removeAttribute('src');
        } catch (_) {}

        const newAudio = document.createElement('audio');
        newAudio.id = 'audioPlayer';
        newAudio.preload = 'auto';
        if (oldAudio.crossOrigin) {
            newAudio.crossOrigin = oldAudio.crossOrigin;
        }
        newAudio.volume = oldAudio.volume;
        newAudio.muted = oldAudio.muted;
        newAudio.loop = oldAudio.loop;
        if (oldAudio.src && !oldAudio.src.endsWith(window.location.href)) {
            newAudio.src = oldAudio.src;
        }
        if (oldAudio.parentNode) {
            oldAudio.parentNode.replaceChild(newAudio, oldAudio);
        }
        audio = newAudio;
        attachAudioListeners(audio);
    }

    function getOrCreateAudioSourceNode() {
        if (!audioContext || !audio) return null;
        if (audioSourceNode) return audioSourceNode;
        if (audio._mediaSourceNode && audio._mediaSourceContext === audioContext) {
            audioSourceNode = audio._mediaSourceNode;
            return audioSourceNode;
        }
        try {
            audioSourceNode = audioContext.createMediaElementSource(audio);
            audio._mediaSourceNode = audioSourceNode;
            audio._mediaSourceContext = audioContext;
            return audioSourceNode;
        } catch (_) {
            // Chromium safety fallback: if element was attached to an earlier context, refresh it
            resetMediaElementForNewAudioContext();
            try {
                audioSourceNode = audioContext.createMediaElementSource(audio);
                audio._mediaSourceNode = audioSourceNode;
                audio._mediaSourceContext = audioContext;
            } catch (e2) {
                console.error('Failed to create MediaElementSource on replacement element:', e2);
            }
            return audioSourceNode;
        }
    }

    function updateAudioRouting() {
        if (!audioContext) return;
        if (!audioSourceNode) {
            getOrCreateAudioSourceNode();
        }
        if (!audioSourceNode) return;
        try {
            audioSourceNode.disconnect();
            if (softwareSourceGainNode) {
                try { softwareSourceGainNode.disconnect(); } catch (_) {}
            }
            if (subsonicFilter) subsonicFilter.disconnect();
            if (replayGainNode) replayGainNode.disconnect();
            if (preAmpGainNode) preAmpGainNode.disconnect();
            if (xfeedNetwork && xfeedNetwork.output) xfeedNetwork.output.disconnect();
            if (peqNodes) peqNodes.forEach(node => { try { node.disconnect(); } catch (_) {} });
            if (bassFilter) bassFilter.disconnect();
            if (vocalFilter) vocalFilter.disconnect();
            if (trebleFilter) trebleFilter.disconnect();
            if (ampGainNode) ampGainNode.disconnect();
            if (dspLimiter) dspLimiter.disconnect();
            if (ceilingTrimGain) ceilingTrimGain.disconnect();
            if (ampSoftClipper) ampSoftClipper.disconnect();
            if (dspWorkletNode) {
                try { dspWorkletNode.disconnect(); } catch (_) {}
            }

            // Headroom Pre-Amp Gain
            updatePreAmpGain(audioContext.currentTime);

            // Active source: if in software decoding buffer mode, route through softwareSourceGainNode
            const activeSource = (isSoftwareDecoding && softwareSourceGainNode) ? softwareSourceGainNode : audioSourceNode;

            // Root node after source: Subsonic (only if worklet is not active, avoiding duplicate 24dB/oct roll-off) + ReplayGain + Pre-Amp headroom
            let rootNode = activeSource;
            if (isSubsonic && subsonicFilter && !dspWorkletNode) {
                activeSource.connect(subsonicFilter);
                rootNode = subsonicFilter;
            }
            if (replayGainNode) {
                rootNode.connect(replayGainNode);
                rootNode = replayGainNode;
            }
            if (preAmpGainNode) {
                rootNode.connect(preAmpGainNode);
                rootNode = preAmpGainNode;
            }

            if (!hasActiveDsp()) {
                // Pure Native Linear Pass-Through:
                // If 64-bit precision worklet is loaded, stream through double-precision worklet buffer; otherwise direct DAC stream
                if (dspWorkletNode && isPrecision64) {
                    rootNode.connect(dspWorkletNode);
                    dspWorkletNode.connect(audioContext.destination);
                } else {
                    rootNode.connect(audioContext.destination);
                }
                // Non-invasive parallel tap to analyser (visualizer receives full native audio data)
                if (analyser) {
                    rootNode.connect(analyser);
                }
            } else {
                let current = rootNode;

                // Bauer Headphone Crossfeed (if active)
                if (isCrossfeed && xfeedNetwork) {
                    current.connect(xfeedNetwork.input);
                    current = xfeedNetwork.output;
                }

                // 10-Band Parametric Equalizer Stage
                if (peqNodes && peqNodes.length > 0) {
                    for (const peqBand of peqNodes) {
                        current.connect(peqBand);
                        current = peqBand;
                    }
                }

                // Full Studio DSP & Dynamics Engine Route:
                current.connect(bassFilter);
                bassFilter.connect(vocalFilter);
                vocalFilter.connect(trebleFilter);
                if (analyser) trebleFilter.connect(analyser);
                trebleFilter.connect(ampGainNode);

                // Only route through DynamicsCompressor + SoftClipper when Limiter or Volume Overdrive (>100%) is active
                let terminalNode = ampGainNode;
                if ((isLimiter || currentVolumeValue > 1.0) && dspLimiter && ampSoftClipper) {
                    ampGainNode.connect(dspLimiter);
                    if (ceilingTrimGain) {
                        dspLimiter.connect(ceilingTrimGain);
                        ceilingTrimGain.connect(ampSoftClipper);
                    } else {
                        dspLimiter.connect(ampSoftClipper);
                    }
                    terminalNode = ampSoftClipper;
                }

                // Route through 64-bit AudioWorklet (Ultrasonic IMD filter, Ambiophonics R.A.C.E., TPDF/Noise-Shaped Dither)
                if (dspWorkletNode) {
                    terminalNode.connect(dspWorkletNode);
                    dspWorkletNode.connect(audioContext.destination);
                } else {
                    terminalNode.connect(audioContext.destination);
                }
            }
        } catch (e) {
            console.warn('Audio routing update warning:', e);
        }
        updateDacStatusUi();
    }

    async function ensureAudioEngineForSampleRate(targetRate = 44100, forceRecreate = false) {
        // Respect native integer clocking (44.1k, 48k, 88.2k, 96k, 176.4k, 192k)
        const cleanRate = getValidSampleRate(targetRate);
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return null;

        // If audioContext is already initialized and active, reuse it to preserve active HTMLMediaElement source & user gesture state
        if (!forceRecreate && audioContext && audioContext.state !== 'closed') {
            if (audioContext.state === 'suspended') {
                audioContext.resume().catch(() => {});
            }
            if (!audioSourceNode) {
                getOrCreateAudioSourceNode();
                updateAudioRouting();
            }
            updateDacStatusUi();
            return audioContext;
        }

        // Initial creation needed
        try {
            if (dspWorkletNode) {
                try { dspWorkletNode.disconnect(); } catch (_) {}
                dspWorkletNode = null;
            }
            if (audioSourceNode) {
                try { audioSourceNode.disconnect(); } catch (_) {}
                audioSourceNode = null;
            }
            if (audioContext) {
                try { await audioContext.close(); } catch (_) {}
                audioContext = null;
                resetMediaElementForNewAudioContext();
            }

            // Create studio-grade AudioContext with native sample rate and user latency target
            const latencyHintVal = bufferLatencyTarget === 'interactive' ? 'interactive' : 'playback';
            try {
                audioContext = new AudioCtx({
                    sampleRate: cleanRate,
                    latencyHint: latencyHintVal
                });
            } catch (err) {
                console.warn(`Hardware or browser rejected sampleRate (${cleanRate}Hz), falling back gracefully:`, err);
                try {
                    audioContext = new AudioCtx({ latencyHint: latencyHintVal });
                } catch (_) {
                    audioContext = new AudioCtx();
                }
            }

            initDspNodes();
            getOrCreateAudioSourceNode();
            updateAudioRouting();
            loadDspWorklet().catch(() => {});

            if (audioContext && audioContext.state === 'suspended') {
                audioContext.resume().catch(() => {});
            }
        } catch (e) {
            console.error('ensureAudioEngineForSampleRate failure:', e);
        }

        updateDacStatusUi();
        return audioContext;
    }

    function initAudioContext(preferredRate = null) {
        if (audioContext && audioContext.state !== 'closed') {
            if (audioContext.state === 'suspended') {
                audioContext.resume().catch(() => {});
            }
            return audioContext;
        }

        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return null;

        if (!preferredRate) {
            const track = allTracks[currentTrackIndex];
            preferredRate = (track && track.sampleRate) ? getValidSampleRate(track.sampleRate) : 44100;
        }
        const cleanRate = getValidSampleRate(preferredRate);

        const latencyHintVal = bufferLatencyTarget === 'interactive' ? 'interactive' : 'playback';
        try {
            audioContext = new AudioCtx({
                sampleRate: cleanRate,
                latencyHint: latencyHintVal
            });
        } catch (err) {
            try {
                audioContext = new AudioCtx({ latencyHint: latencyHintVal });
            } catch (_) {
                audioContext = new AudioCtx();
            }
        }

        dspWorkletNode = null;
        initDspNodes();
        getOrCreateAudioSourceNode();
        updateAudioRouting();
        loadDspWorklet().catch(() => {});
        updateDacStatusUi();
        return audioContext;
    }

    // Unlock AudioContext on any user interaction if suspended
    ['click', 'keydown', 'touchstart', 'pointerdown'].forEach(ev => {
        window.addEventListener(ev, () => {
            if (audioContext && audioContext.state === 'suspended') {
                audioContext.resume().catch(() => {});
            }
        }, { passive: true });
    });


    // Attach top-level Audio Engine functions to window for cross-module accessibility
    if (typeof window !== "undefined") {
        try { window.checkHardwareGainStatus = checkHardwareGainStatus; } catch (_) {}
        try { window.computeLimiterProfile = computeLimiterProfile; } catch (_) {}
        try { window.createCrossfeedNetwork = createCrossfeedNetwork; } catch (_) {}
        try { window.createLinearCurve = createLinearCurve; } catch (_) {}
        try { window.createSoftClipCurve = createSoftClipCurve; } catch (_) {}
        try { window.dispatchHardwareVolume = dispatchHardwareVolume; } catch (_) {}
        try { window.drawPeqCurve = drawPeqCurve; } catch (_) {}
        try { window.ensureAudioEngineForSampleRate = ensureAudioEngineForSampleRate; } catch (_) {}
        try { window.getEffectiveAmplification = getEffectiveAmplification; } catch (_) {}
        try { window.getOrCreateAudioSourceNode = getOrCreateAudioSourceNode; } catch (_) {}
        try { window.getPreAmpGainValue = getPreAmpGainValue; } catch (_) {}
        try { window.hwVolumeDebounceTimer = hwVolumeDebounceTimer; } catch (_) {}
        try { window.importAutoEqProfile = importAutoEqProfile; } catch (_) {}
        try { window.initAudioContext = initAudioContext; } catch (_) {}
        try { window.initDspNodes = initDspNodes; } catch (_) {}
        try { window.initPeqWorkstation = initPeqWorkstation; } catch (_) {}
        try { window.loadDspWorklet = loadDspWorklet; } catch (_) {}
        try { window.markHwGainUnavailable = markHwGainUnavailable; } catch (_) {}
        try { window.resetMediaElementForNewAudioContext = resetMediaElementForNewAudioContext; } catch (_) {}
        try { window.setDspBoost = setDspBoost; } catch (_) {}
        try { window.setPeqBandGain = setPeqBandGain; } catch (_) {}
        try { window.setPeqBandQ = setPeqBandQ; } catch (_) {}
        try { window.setPeqPreset = setPeqPreset; } catch (_) {}
        try { window.setVolume = setVolume; } catch (_) {}
        try { window.setupDspControls = setupDspControls; } catch (_) {}
        try { window.setupNeutronSettingsControls = setupNeutronSettingsControls; } catch (_) {}
        try { window.toggleDspBoost = toggleDspBoost; } catch (_) {}
        try { window.toggleReplayGain = toggleReplayGain; } catch (_) {}
        try { window.updateAmpGain = updateAmpGain; } catch (_) {}
        try { window.updateAudioRouting = updateAudioRouting; } catch (_) {}
        try { window.updateDspButtonsUi = updateDspButtonsUi; } catch (_) {}
        try { window.updateLimiterState = updateLimiterState; } catch (_) {}
        try { window.updatePreAmpGain = updatePreAmpGain; } catch (_) {}
        try { window.updateWorkletParams = updateWorkletParams; } catch (_) {}
    }

    export {
        checkHardwareGainStatus,
        computeLimiterProfile,
        createCrossfeedNetwork,
        createLinearCurve,
        createSoftClipCurve,
        dispatchHardwareVolume,
        drawPeqCurve,
        ensureAudioEngineForSampleRate,
        getEffectiveAmplification,
        getOrCreateAudioSourceNode,
        getPreAmpGainValue,
        hwVolumeDebounceTimer,
        importAutoEqProfile,
        initAudioContext,
        initDspNodes,
        initPeqWorkstation,
        loadDspWorklet,
        markHwGainUnavailable,
        resetMediaElementForNewAudioContext,
        setDspBoost,
        setPeqBandGain,
        setPeqBandQ,
        setPeqPreset,
        setVolume,
        setupDspControls,
        setupNeutronSettingsControls,
        toggleDspBoost,
        toggleReplayGain,
        updateAmpGain,
        updateAudioRouting,
        updateDspButtonsUi,
        updateLimiterState,
        updatePreAmpGain,
        updateWorkletParams
    };
