import assert from 'node:assert/strict';
import {appAttenuation,createLinearCurve,createSoftClipCurve,computeLimiterProfile,effectiveLimiterEnabled,requiresPeakProtection,getEffectiveAmplification,getPreAmpGainValue,computeReplayGainMultiplier,hasUserShapingDsp} from '../scripts/modules/audio-policies.js';
const flat={currentVolumeValue:1,isPeqBypassed:true,peqGains:Array(10).fill(0),ditherMode:'off',stereoBalance:0,allTracks:[],currentTrackIndex:0};
assert.equal(getEffectiveAmplification(flat),1);
assert.equal(getPreAmpGainValue(flat),1);
assert.equal(computeReplayGainMultiplier(flat),1);
assert.ok(!hasUserShapingDsp(flat));
assert.ok(computeLimiterProfile(flat).isBypassed);
assert.ok(getEffectiveAmplification({...flat,isAmpBoost:true})>1);
assert.ok(getPreAmpGainValue({...flat,isPeqBypassed:false,peqGains:[6]})<1);
assert.ok(hasUserShapingDsp({...flat,isCrossfeed:true}));
assert.equal(computeReplayGainMultiplier({...flat,isReplayGain:true,currentTrack:{replayGain:6,replayPeak:1}}),.965);
assert.ok(computeLimiterProfile({...flat,isLimiter:true,isBassBoost:true}).threshold<-1.5);
const lin=createLinearCurve(),soft=createSoftClipCurve();
assert.equal(lin.length,2048);assert.equal(lin[0],-1);assert.equal(lin.at(-1),1);
assert.ok(soft.at(-1)<1);assert.equal(soft[1000],lin[1000]);
console.log('PASS audio control policies: gain staging, replay gain, limiter profiles, bypass and curves');
// An OS mixer preference must not silently add digital overdrive.
assert.equal(getEffectiveAmplification({...flat,currentVolumeValue:1.5,isHardwareGain:true,hwGainAvailable:true}),1);
assert.ok(!hasUserShapingDsp({...flat,currentVolumeValue:1.5,isHardwareGain:true,hwGainAvailable:true}));
assert.equal(getEffectiveAmplification({...flat,currentVolumeValue:1.5,isHardwareGain:true,hwGainAvailable:false}),1);
assert.equal(appAttenuation({...flat,currentVolumeValue:1.5,isHardwareGain:true,hwGainAvailable:false,hardwareAppGain:.2}),.2);
assert.equal(appAttenuation({...flat,currentVolumeValue:NaN}),0);
for(const gain of [Infinity,-Infinity,NaN,300,-300])assert.equal(computeReplayGainMultiplier({...flat,isReplayGain:true,currentTrack:{replayGain:gain}}),1);
assert.equal(computeReplayGainMultiplier({...flat,isReplayGain:true,currentTrack:{replayGain:20,replayPeak:NaN}}),1);
assert.equal(computeReplayGainMultiplier({...flat,isReplayGain:true,currentTrack:{replayGain:24,replayPeak:.01}}),4);
console.log('PASS system mixer and digital gain separation');

assert.equal(effectiveLimiterEnabled(flat),false);
for(const state of [{isAmpBoost:true},{isPeqBypassed:false,peqGains:[12]},{isPeqBypassed:false,peqGains:[-5]},{isAmbiophonics:true},{isSurroundWidener:true},{currentVolumeValue:1.3}]){assert(requiresPeakProtection({...flat,...state}));assert(!computeLimiterProfile({...flat,...state}).isBypassed);}
assert.equal(effectiveLimiterEnabled({...flat,isHardwareGain:true,hwGainAvailable:true,currentVolumeValue:1.5}),false);
console.log('PASS automatic peak protection for shaped audio, flat bypass retained');

const {buildAudioDiagnostic}=await import('../scripts/modules/signal-path-model.js');
const report=buildAudioDiagnostic({...flat,currentTrack:{title:'PRIVATE',src:'PRIVATE'},audio:{src:'PRIVATE',volume:.3,paused:false},audioContext:{sampleRate:48000,state:'running'}},{filename:'PRIVATE.flac',title:'PRIVATE',src:'PRIVATE',sampleRate:48000},false,'direct');
assert(!JSON.stringify(report).includes('PRIVATE'));assert.equal(report.source.format,'FLAC');assert.equal(report.physicalOutputVerified,false);
console.log('PASS diagnostic snapshot excludes source names and paths');

assert.equal(getEffectiveAmplification({...flat,currentVolumeValue:Number.MAX_VALUE}),getEffectiveAmplification({...flat,currentVolumeValue:1.5}));
assert.deepEqual(computeLimiterProfile({...flat,currentVolumeValue:Number.MAX_VALUE}),computeLimiterProfile({...flat,currentVolumeValue:1.5}));
assert.equal(getPreAmpGainValue({...flat,isPeqBypassed:false,peqGains:[Infinity,NaN,1e100]}),getPreAmpGainValue({...flat,isPeqBypassed:false,peqGains:[15]}));
console.log('PASS corrupted overdrive and EQ settings bounded by supported control geometry');
