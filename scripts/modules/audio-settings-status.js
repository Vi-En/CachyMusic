import {effectiveLimiterEnabled,requiresPeakProtection} from './audio-policies.js';
import {ultrasonicFilterPossible} from './ultrasonic-status.js';
// Preferences and route capabilities are distinct. A fallback limiter is a
// different algorithm from the worklet limiter; AGP is not implemented there.
const effects={amp:'isAmpBoost',bass:'isBassBoost',vocal:'isVocalBoost',treble:'isTrebleBoost',limiter:'isLimiter',xfeed:'isCrossfeed',subsonic:'isSubsonic',agp:'isAgpEnabled',surround:'isSurroundWidener',phase:'isPhaseInvert',mono:'isMonoMix',speaker:'isAmbiophonics',ultrasonic:'isUltrasonic'};
const workletOnly=new Set(['agp','surround','phase','mono','speaker','ultrasonic','balance','dither','precision']);
export function effectState(s,key,route,{ackPending=false}={}){
    const selected=key==='limiter'?effectiveLimiterEnabled(s):key==='peq'?!s.isPeqBypassed&&s.peqGains?.some(g=>g!==0):key==='balance'?Math.abs(s.stereoBalance||0)>.005:key==='dither'?!!s.ditherMode&&s.ditherMode!=='off':key==='precision'?!!s.mathPrecision&&s.mathPrecision!=='native':Boolean(s[effects[key]]);
    if(!selected)return 'off';
    if(!route)return 'pending';
    if(route==='native'||route==='direct')return 'unsupported';
    if(route==='fallback'&&workletOnly.has(key))return 'unsupported';
    if(key==='xfeed'&&route==='fallback'&&s.xfeedNetwork===null)return 'unsupported';
    if(key==='ultrasonic'&&!ultrasonicFilterPossible(s.ultrasonicCutoff,s.audioContext?.sampleRate))return 'unsupported';
    if(key==='speaker'&&s.isCrossfeed)return 'unsupported';
    return ackPending&&route==='worklet'?'pending':'applied';
}
export function audioSettingsStatus(s,route,{bufferPending=false,nativeActive=false,ackPending=false,failed=false}={}){
    const notes=[];
    if(failed)notes.push('Audio update failed; check playback before retrying.');
    if(bufferPending)notes.push('Buffer profile pending until the audio graph can be rebuilt safely.');
    if(nativeActive)notes.push('Native Android playback bypasses Web Audio DSP.');
    else if(!route)notes.push('DSP will apply when Web Audio playback initializes.');
    else if(route==='direct')notes.push('Direct route: DSP bypassed.');
    else if(route==='fallback'){
        const names={precision:'Selected precision',dither:'Dithering',speaker:'Speaker processing',surround:'Stereo widening',phase:'Phase inversion',mono:'Mono mix',balance:'Stereo balance',agp:'Adaptive gain protection',ultrasonic:'Ultrasonic filtering'};
        const unsupported=Object.keys(names).filter(key=>effectState(s,key,route)==='unsupported').map(key=>names[key]);
        if(unsupported.length)notes.push(`${unsupported.join(', ')} require AudioWorklet.`);
        if(effectState(s,'xfeed',route)==='unsupported')notes.push('Crossfeed network unavailable.');
        if(effectiveLimiterEnabled(s))notes.push('Fallback limiter uses a different algorithm.');
    }
    if(s.isUltrasonic&&s.audioContext&&!ultrasonicFilterPossible(s.ultrasonicCutoff,s.audioContext.sampleRate))notes.push('Ultrasonic cutoff exceeds this graph’s usable frequency range.');
    if(s.isAmbiophonics&&s.isCrossfeed)notes.push('Headphone crossfeed takes priority over speaker processing.');
    if(requiresPeakProtection(s)&&!s.isLimiter&&!nativeActive&&route&&route!=='direct')notes.push('Automatic peak protection configured for active effects.');
    if(ackPending)notes.push('Waiting for DSP parameter acknowledgement.');
    return notes.length?notes.join(' '):'Audio settings applied to the current route.';
}
