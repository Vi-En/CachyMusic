import {findTrackIndex, findSavedTrackIndex, rememberTrack} from './track-session.js';
import {resolveTrackFormat} from './signal-path-model.js';
import {renderSignalPath} from './signal-path-ui.js';
import {createMprisClient} from './mpris-client.js';
import {updateMarqueeText, recomputeMarquees} from './player-marquee.js';
import {renderTrackMetadata, applyArtworkToDeck} from './player-presentation.js';
import {
    NativeTransport, identifyQueueEntries, indexedSource,
    removeConsumedQueueEntries, restoreNativeQueue, saveNativeQueue
} from './android-native-playback.js';
import { inspectFlac } from './flac-reader.js';
import { PcmRangeSource } from './pcm-range.js';
import { inspectPcm } from './pcm-reader.js';
import { PcmStream } from './pcm-stream.js';
import { nextPcmCandidate, sameCandidate, canScheduleSuccessor } from './pcm-transition.js';
import { resolveTrackSource, resolveLocalFile, releaseInactiveSources } from './local-source.js';
import { DecodeBudgetError, MAX_COMPRESSED_BYTES, MAX_PCM_BYTES, validateDecodeBudget, readBoundedAudio } from './decode-budget.js';
// CachyMusic - Core Audio Player, Software Decoder & Gapless Transport
import {
    formatTime,
    getValidSampleRate,
    safeStorage,
    showCachyToast,
    showToast
} from './utils.js';
import { hasActiveDsp, store } from './state.js';
import {
    albumName,
    artistName,
    bgDisc,
    coverBadge,
    currentTimeEl,
    miniCurrentTime,
    miniProgressBar,
    miniTotalDuration,
    playPauseBtn,
    progressBar,
    repeatBtn,
    shuffleBtn,
    standaloneBanner,
    standaloneBannerTitle,
    tabPlaylists,
    totalDurationEl,
    trackBadge,
    trackList,
    trackName,
    updateEmptyPlayerState,
    updateMiniPlayerInfo,
    updateMiniPlayerPlayState,
    vinylTurntable,
    volumeIcon
} from './ui-elements.js';
import { updateActiveLyric, updateLyricsDisplay } from './lyrics.js';
import { appendDebugTelemetry, cancelSleepTimer, logAudioPlaybackEvent } from './settings.js';
import { getConfirmedAudioRoute, audioBufferChangePending, ensureAudioEngineForSampleRate, getOrCreateAudioSourceNode, resumeAudioGraph, setVolume, updateAudioRouting } from './audio-engine.js';
import { getRuntime } from './runtime-capabilities.js';
import { mediaSessionController } from './media-session.js';

// Native playback explicitly opts out of Web Audio effects. A single transport owns sound.
const androidNative = typeof window!=='undefined'&&typeof window.AndroidBridge?.nativePlaybackLoad==='function'?new NativeTransport(window.AndroidBridge):null;
let nativePoll=null,nativeReleasing=null,nativeEndedToken='',nativeLastGain=null,nativeWarningToken='',nativeLoadOffset=0;
let nativeOrderInputs = [];
let nativeQueueEdits = 0;
let nativeRecoveryToken = '';
let nativeAttemptGeneration = -1;
const NATIVE_QUEUE_STORAGE = 'cachymusic_android_session_queue';
function canUseAndroidDecoder(track) {
    const s = store.state;
    return androidNative && Boolean(indexedSource(track)) && !hasActiveDsp()
        && (s.currentPlaybackSpeed || 1) === 1
        && safeStorage.getItem('cachymusic_continuous_pcm') !== 'true';
}
function nativeEligible(track) {
    return canUseAndroidDecoder(track) && (safeStorage.getItem('cachymusic_android_native') === 'true'
        || (nativeRecoveryToken && nativeRecoveryToken === androidNative.token));
}
function nativeGain(){const s=store.state;return s.audio?.muted?0:s.isHardwareGain?1:Math.max(0,Math.min(1,s.currentVolumeValue));}
function nativePosition(){return androidNative?.active?Number(androidNative.read()?.position||0)/1000:null;}
function nativeDuration(){return androidNative?.active?Number(androidNative.read()?.duration||0)/1000:null;}
function reconcileNativeQueue(status) {
    if (!androidNative?.supportsQueue) return;
    const s = store.state;
    const remaining = removeConsumedQueueEntries(s.playQueue, status?.consumedQueueIds);
    if (remaining === s.playQueue) return;
    s.playQueue = remaining;
    store.emit('library:update-queue', { fromNative: true });
}
function rememberNativeQueue(token) {
    if (androidNative.supportsQueue) safeStorage.setItem(NATIVE_QUEUE_STORAGE, saveNativeQueue(token, store.state.playQueue));
}
function nativeOrderKey(status) {
    const s = store.state;
    return [status.token, status.revision, s.allTracks[s.currentTrackIndex], s.allTracks, s.allTracks.length,
        s.displayedTracks, s.displayedTracks.length, s.playQueue, s.playQueue.length, nativeQueueEdits, s.isShuffle, s.repeatMode, s.sleepTimerMode === 'end'];
}
function refreshNativeOrder(status = androidNative?.read()) {
    if (!androidNative?.supportsOrder || nativeReleasing || !status || status.state === 'stopped') return;
    if (status.token === nativeRecoveryToken) return;
    reconcileNativeQueue(status);
    const s = store.state;
    if (nativeOrderKey(status).every((value, i) => value === nativeOrderInputs[i])) return;
    if (androidNative.supportsQueue) {
        s.playQueue = identifyQueueEntries(s.playQueue);
        rememberNativeQueue(status.token);
    }
    if (['unconfirmed', 'error'].includes(status.state)) return;
    const index = indexedSource(s.allTracks[s.currentTrackIndex]) === status.uri
        ? s.currentTrackIndex : s.allTracks.findIndex(track => indexedSource(track) === status.uri);
    if (index < 0) return;
    const order = s.sleepTimerMode !== 'end' && nativeEligible(s.allTracks[index])
        ? androidNative.buildOrder(index === s.currentTrackIndex ? s : { ...s, currentTrackIndex: index }, status.token, nativeQueueEdits)
        : null;
    if (androidNative.setOrder(status, order)) nativeOrderInputs = nativeOrderKey(status);
}
function updateShuffleButton() {
    if (!shuffleBtn) return;
    const { isShuffle } = store.state;
    shuffleBtn.classList.toggle('active', isShuffle);
    shuffleBtn.setAttribute('title', isShuffle ? 'Shuffle Active' : 'Toggle Shuffle');
}

function syncNativeTrack(status) {
    const s = store.state;
    if (!status?.uri || status.uri === indexedSource(s.allTracks[s.currentTrackIndex])) return true;
    const index = s.allTracks.findIndex(track => indexedSource(track) === status.uri);
    if (index >= 0) loadTrack(index, false, status.position / 1000, status);
    else stopNative().then(stopped => { if (stopped) syncPlayPauseUI(false, true); });
    return index >= 0;
}
function stopNative(){
    if(!androidNative)return Promise.resolve(true);
    if(nativeReleasing)return nativeReleasing;
    const token = androidNative.token || androidNative.snapshot()?.token;
    nativeReleasing = androidNative.stop().then(ok => {
        if (ok) {
            const stopped = androidNative.snapshot();
            if (token && stopped?.token === token && stopped.state === 'stopped') {
                reconcileNativeQueue(stopped);
                if (androidNative.supportsQueue) safeStorage.removeItem(NATIVE_QUEUE_STORAGE);
            }
            clearInterval(nativePoll);
            nativePoll = null;
            nativeLastGain = null;
            nativeOrderInputs = [];
        } else showToast('Native playback has not confirmed stop. Try again before changing tracks.');
        return ok;
    }).finally(() => { nativeReleasing = null; });
    return nativeReleasing;
}
function startNativePoll(){
    if(nativePoll)return;
    let savedPositionKey = '';
    const tick=()=>{
        if(nativeReleasing||!androidNative?.active)return;
        const v=androidNative.read(),s=store.state;if(!v)return;
        if(v.state==='stopped'){
            reconcileNativeQueue(v);
            if (androidNative.supportsQueue) safeStorage.removeItem(NATIVE_QUEUE_STORAGE);
            androidNative.token='';androidNative.last=null;clearInterval(nativePoll);nativePoll=null;nativeOrderInputs=[];
            syncPlayPauseUI(false,true);updateSignalPathUi(s.allTracks[s.currentTrackIndex]);return;
        }
        reconcileNativeQueue(v);
        if (!syncNativeTrack(v)) return;
        const track=s.allTracks[s.currentTrackIndex];
        const position=Number(v.position||0)/1000,duration=Number(v.duration||0)/1000||track?.duration||0;
        if(v.state==='error'&&!nativeEligible(track)){loadTrack(s.currentTrackIndex,false,position);return;}
        if(v.state==='unconfirmed'||v.state==='error'){
            syncPlayPauseUI(false);
            if (nativeWarningToken !== v.token) {
                nativeWarningToken = v.token;
                showToast(v.token === nativeRecoveryToken ? 'Android could not decode this file.'
                    : 'Native playback unavailable. Disable Native Android playback and retry.');
            }
            return;
        }
        if(!nativeEligible(track)){
            // Preserve the current position before returning to the DSP-capable backend.
            const playing=v.state==='playing'||v.state==='loading'||v.state==='seeking';
            loadTrack(s.currentTrackIndex,playing,position);return;
        }
        refreshNativeOrder(v);
        const gain=nativeGain();if(gain!==nativeLastGain&&androidNative.command('gain',0,gain))nativeLastGain=gain;
        updatePlaybackProgress(position,duration);
        if(totalDurationEl)totalDurationEl.textContent=formatTime(duration);if(miniTotalDuration)miniTotalDuration.textContent=formatTime(duration);
        if(v.state==='playing'||v.state==='paused'||v.state==='ended'){
            if (v.state !== 'ended') s.userExplicitlyPaused = v.state === 'paused';
            syncPlayPauseUI(v.state==='playing');
        }
        if(v.state!=='ended')nativeEndedToken='';
        const endKey = `${v.token}:${v.revision ?? 0}`;
        if (v.state === 'ended' && nativeEndedToken !== endKey) {
            nativeEndedToken = endKey;
            if (s.sleepTimerMode === 'end') {
                s.userExplicitlyPaused = true;
                cancelSleepTimer(false);
                showToast('Sleep timer: End of track reached. Playback paused.');
            } else if (s.repeatMode === 'one') androidNative.command('play');
            else if (!v.shuffleExhausted || !s.isShuffle || s.repeatMode !== 'off' || s.playQueue.length) nextTrack(false);
        }
        const second = Math.floor(position);
        const positionKey = `${endKey}:${second}`;
        if (second > 0 && second % 5 === 0 && positionKey !== savedPositionKey) {
            savedPositionKey = positionKey;
            try { safeStorage.setItem('cachymusic_last_track_time', position.toFixed(2)); } catch (_) {}
        }
    };
    nativePoll=setInterval(tick,250);tick();
}
let mprisClient = null;
function initMprisBridge() {
    if (!getRuntime().hasMprisBridge || mprisClient) return;
    mprisClient = createMprisClient({state: store.state, actions: {
        softwarePosition, pauseAudio, playAudio, seekAudio, nextTrack, prevTrack,
        setVolume, updateShuffleButton, refreshNativeOrder, updateRepeatUI
    }});
    mprisClient.start();
}
function mprisSyncHook(force) { mprisClient?.reportState(force); }

let currentPlayRequestId = 0;
let currentTrackGeneration = 0;
let explicitTransportVersion = 0;
export function playbackIntentVersion() { return `${currentTrackGeneration}:${currentPlayRequestId}:${explicitTransportVersion}`; }
let mediaElementGeneration = -1;
let activeLoadedMetadataHandler = null;
let playPendingTimeout = null;
let noDataStallTimer = null;
let removeNoDataListener = null;
let seekStallTimer = null;
let lastPositionStateUpdate = 0;
let activeDecodeAbortController = null;
const softwareBufferCache = new Map();
let trackLoadToken = 0;
let pcmStream = null;
let pcmFile = null;
let pendingPcm = null;
function continuousPcmEnabled(){return store.state.sleepTimerMode!=='end' && safeStorage.getItem('cachymusic_continuous_pcm')==='true' && (store.state.currentPlaybackSpeed||1)===1;}
function pcmExtension(track,file){return /\.(wav|wave|aif|aiff|flac)$/i.test(track?.filename||file?.name||'');}
function shouldStreamAndroidFlac(track) {
    const s = store.state;
    return androidNative && indexedSource(track) && /\.flac$/i.test(track.filename || '')
        && hasActiveDsp() && (s.currentPlaybackSpeed || 1) === 1 && typeof Worker === 'function';
}
function cancelPcmSuccessor(){const old=pendingPcm;pendingPcm=null;old?.stream?.stop();}
function stopPcmStream(){cancelPcmSuccessor();const old=pcmStream;pcmStream=null;old?.stop();}
function softwarePosition(){const s=store.state;return pcmStream?.started?pcmStream.position():Math.max(0, s.softwarePlaybackOffset+(!s.isSoftwarePaused&&s.audioContext&&s.softwarePlaybackStartTime>0&&!s.activeDecodedBuffer?.streaming?Math.max(0,s.audioContext.currentTime-s.softwarePlaybackStartTime):0));}
async function preparePcmInput(track,localFile){
    const file=localFile===undefined?await resolveLocalFile(track):localFile;
    if(!pcmExtension(track,file))return null;
    let input=file;
    if(!input){let src=track.src||'';if(src.startsWith('../'))src=src.substring(3);
        const rangeSrc=/^\d+$/.test(String(track.tid||''))&&/(?:^|\/)php\/api\/stream\.php\?/.test(src)?`php/api/stream.php?tid=${track.tid}`:src;
        input=await PcmRangeSource.open(rangeSrc);}
    const format=await (/\.flac$/i.test(track.filename||file?.name||'')?inspectFlac:inspectPcm)(input);
    return {file:input instanceof PcmRangeSource?input.descriptor():input,format};
}
function makePcmStream(file,format){
    const s=store.state;
    const stream=new PcmStream(s.audioContext,s.softwareSourceGainNode,file,format,{
        onStart:(anchor,offset)=>{if(pcmStream!==stream)return;s.softwarePlaybackStartTime=anchor;s.softwarePlaybackOffset=offset;s.isSoftwarePaused=false;syncPlayPauseUI(true);startSoftwareProgressLoop();},
        onProgress:()=>{if(pcmStream===stream)checkPcmSuccessor(stream);},
        onEnd:()=>{if(pcmStream!==stream){if(pendingPcm?.stream===stream)cancelPcmSuccessor();return;}if(adoptPcmSuccessor())return;pcmStream=null;onSoftwarePlaybackEnded();},
        onError:(error,position)=>{if(pcmStream!==stream){if(pendingPcm?.stream===stream)cancelPcmSuccessor();return;}cancelPcmSuccessor();pcmStream=null;s.softwarePlaybackOffset=Math.max(s.softwarePlaybackOffset,position);s.softwarePlaybackStartTime=0;s.isSoftwarePaused=true;s.userExplicitlyPaused=true;cancelSoftwareProgressLoop();syncPlayPauseUI(false);showCachyToast('PCM playback interrupted',error.message,'error');}
    });
    return stream;
}
function checkPcmSuccessor(current){
    if(!pendingPcm&&current.endTime-current.ctx.currentTime>5)return;
    const s=store.state,candidate=continuousPcmEnabled()&&!audioBufferChangePending()?nextPcmCandidate(s):null;
    if(pendingPcm&&!sameCandidate(pendingPcm.candidate,candidate))cancelPcmSuccessor();
    if(!candidate||!pcmExtension(candidate.track)||current.endTime-current.ctx.currentTime>5)return;
    if(!pendingPcm&&!sameCandidate(current.lastAttempt,candidate)){
        current.lastAttempt=candidate;
        const job={candidate,current,stream:null};pendingPcm=job;
        (async()=>{
            const result=await preparePcmInput(candidate.track);
            if(!result||pendingPcm!==job||pcmStream!==current)return;
            job.file=result.file;job.format=result.format;job.stream=makePcmStream(job.file,job.format);
            await job.stream.prepare(0);
            if(pendingPcm!==job||pcmStream!==current){job.stream.stop();return;}
            checkPcmSuccessor(current);
        })().catch(()=>{if(pendingPcm===job)cancelPcmSuccessor();});
    }
    if(pendingPcm?.stream&&canScheduleSuccessor(current,pendingPcm.stream)){
        try{pendingPcm.stream.startPrepared(current.endTime,{notify:false});}catch(_){cancelPcmSuccessor();}
    }
}
function adoptPcmSuccessor(){
    const s=store.state,job=pendingPcm;
    if(!job?.stream?.started||job.stream.closed||audioBufferChangePending()||!continuousPcmEnabled()||!sameCandidate(job.candidate,nextPcmCandidate(s))){cancelPcmSuccessor();return false;}
    pendingPcm=null;pcmStream=job.stream;pcmFile=job.file;
    const {track,index,queue}=job.candidate;
    ++trackLoadToken;++currentTrackGeneration;++currentPlayRequestId;
    if(queue){s.playQueue.shift();store.emit('library:update-queue');}
    s.currentTrackIndex=index;s.currentTrack=track;s.activeDecodedBuffer=job.format;track.duration=job.format.duration;
    s.softwarePlaybackStartTime=pcmStream.anchor;s.softwarePlaybackOffset=0;s.isSoftwarePaused=false;s.trackPlaybackRetryCount=0;
    rememberTrack(safeStorage, track);
    store.emit('track:change',{track,index});
    updateMarqueeText(trackName,track.title||track.filename||'Unknown');updateMarqueeText(artistName,track.artist||'Unknown');updateMarqueeText(albumName,track.album?`Album: ${track.album}`:'Album: Unknown');
    updateTrackBadgeUi(track);applyArtworkToDeck(track.cover||'resources/images/default.svg',Boolean(track.cover&&!track.cover.includes('default.svg')));
    applyTrackMetadataToDom(track,false);updateSignalPathUi(track);updateMiniPlayerInfo(track);updateLyricsDisplay(track);
    if(totalDurationEl)totalDurationEl.textContent=formatTime(track.duration);if(miniTotalDuration)miniTotalDuration.textContent=formatTime(track.duration);
    updatePlaybackProgress(pcmStream.position(),track.duration);mediaSessionController.updateMetadata(track);mediaSessionController.updatePositionState(true);
    store.emit('library:render-window',{preserveScroll:true});mprisSyncHook(true);
    startSoftwareProgressLoop();return true;
}
function startPcmPlayback(){
    const s=store.state, format=s.activeDecodedBuffer;
    stopPcmStream();
    if(!pcmFile||!format?.streaming||!s.audioContext)return;
    if(!s.softwareSourceGainNode||s.softwareSourceGainNode.context!==s.audioContext)s.softwareSourceGainNode=s.audioContext.createGain();
    updateAudioRouting();
    const stream=makePcmStream(pcmFile,format);
    pcmStream=stream;s.softwarePlaybackStartTime=0;s.isSoftwarePaused=false;
    const quickStart = Boolean(androidNative && indexedSource(s.currentTrack));
    stream.start(s.softwarePlaybackOffset, quickStart).catch(err=>stream.fail(err));
}


function shouldPreferSoftwareDecoder(track, cleanSrc = '') {
    const s = store.state;
    if (!track) return false;
    return (continuousPcmEnabled()&&typeof Worker==='function'&&pcmExtension(track)) || s.alwaysSoftwareDecodeUrls.has(cleanSrc)
        || (track.src && s.alwaysSoftwareDecodeUrls.has(track.src))
        ; // Native streaming first, including Android FLAC.
}

function abortActiveSoftwareFetch() {
    if (activeDecodeAbortController) {
        try { activeDecodeAbortController.abort(); } catch (_) {}
        activeDecodeAbortController = null;
    }
}

function cacheSoftwareAudioBuffer(cacheKey, decodedBuffer) {
    if (!cacheKey || !decodedBuffer) return;
    if (softwareBufferCache.has(cacheKey)) {
        softwareBufferCache.delete(cacheKey);
    }
    softwareBufferCache.set(cacheKey, decodedBuffer);
    const totalBytes = () => [...softwareBufferCache.values()].reduce((n,b)=>n+b.length*b.numberOfChannels*4,0);
    while (softwareBufferCache.size && totalBytes() > MAX_PCM_BYTES) {
        softwareBufferCache.delete(softwareBufferCache.keys().next().value);
    }
}

function clearSeekStallTimer() {
    if (seekStallTimer) {
        clearTimeout(seekStallTimer);
        seekStallTimer = null;
    }
}

function clearNoDataStallTimer() {
    if (noDataStallTimer) {
        clearTimeout(noDataStallTimer);
        noDataStallTimer = null;
    }
    removeNoDataListener?.();
    removeNoDataListener = null;
}

function rememberSoftwareDecoder(source) {
    if (!source) return;
    const urls = store.state.alwaysSoftwareDecodeUrls;
    urls.delete(source);
    urls.add(source);
    if (urls.size > 256) urls.delete(urls.values().next().value);
}

function applyTrackMetadataToDom(track, isStandalone = false) {
    renderTrackMetadata(track, isStandalone, updateDacStatusUi);
}

// Load Track by Index in allTracks
async function loadTrack(index, autoPlay = true, initialTime = 0, adoptNative = null, useMediaElement = false) {
    const s = store.state;
    if (!s.allTracks[index]) return;
    const loadToken=++trackLoadToken, loadPlayId=++currentPlayRequestId;
    if(adoptNative){androidNative?.adopt(adoptNative);}else if(!await stopNative()||loadToken!==trackLoadToken)return;
    if (!autoPlay && !adoptNative) s.userExplicitlyPaused = true;
    currentTrackGeneration++;
    if(activeLoadedMetadataHandler&&s.audio)s.audio.removeEventListener('loadedmetadata',activeLoadedMetadataHandler);
    if(s.audio){s.audio.pause();s.audio.removeAttribute("src");s.audio.load();}
    if(s.secondaryAudio){s.secondaryAudio.pause();s.secondaryAudio.removeAttribute("src");s.secondaryAudio.load();}
    s.preloadedNextTrackIndex=-1;
    s.currentTrackIndex = index;
    s.trackPlaybackRetryCount = 0;
    stopSoftwarePlayback();
    s.activeDecodedBuffer = null;
    s.isSoftwareDecoding = false;
    s.isPlayPending = false;
    s.pendingSoftwareSeekSec = null;
    clearNoDataStallTimer();
    clearSeekStallTimer();
    if (playPendingTimeout) {
        clearTimeout(playPendingTimeout);
        playPendingTimeout = null;
    }

    if (s.isStandalonePlayback) {
        s.isStandalonePlayback = false;
        updateStandaloneBannerUi(false);
    }
    const track = s.allTracks[s.currentTrackIndex];
    s.currentTrack = track;

    if (track) rememberTrack(safeStorage, track);

    let trackSrc = adoptNative ? track.src : await resolveTrackSource(track);
    if(loadToken!==trackLoadToken)return;
    releaseInactiveSources(trackSrc);
    if(!trackSrc){syncPlayPauseUI(false);showToast('Music file unavailable. Reimport or relink it.');return;}
    if (trackSrc.startsWith('../')) trackSrc = trackSrc.substring(3);

    const prefersSoftware = shouldPreferSoftwareDecoder(track, trackSrc);
    const streamFlac = !useMediaElement && shouldStreamAndroidFlac(track);
    const isKnownSoftware = prefersSoftware || streamFlac;
    const targetRate = track.sampleRate ? getValidSampleRate(track.sampleRate) : 44100;
    const refreshBuffer = !nativeEligible(track) && audioBufferChangePending();
    if (!adoptNative && (refreshBuffer || !(autoPlay && (isKnownSoftware || nativeEligible(track))))) {
        await ensureAudioEngineForSampleRate(targetRate, refreshBuffer);
    }

    if (loadToken!==trackLoadToken || s.currentTrackIndex !== index) return;

    store.emit('track:change', { track, index });

    const audio = s.audio;
    if (audio) {
        const isCrossOrigin = trackSrc.startsWith('http://') || trackSrc.startsWith('https://');
        let needsCors = false;
        if (isCrossOrigin) {
            try {
                needsCors = new URL(trackSrc, window.location.href).origin !== window.location.origin;
            } catch (_) {}
        }
        if (needsCors) {
            audio.crossOrigin = 'anonymous';
        } else {
            audio.removeAttribute('crossorigin');
        }

        currentTrackGeneration++;
        audio._trackGeneration = currentTrackGeneration;
        if ((!isKnownSoftware || !autoPlay) && trackSrc) {
            audio.src = trackSrc;
            audio._isFreshTrackLoad = true;
            try { audio.load(); } catch (_) {}
        } else {
            try {
                audio.pause();
                audio.removeAttribute('src');
                audio.load();
            } catch (_) {}
        }
    }
    if (useMediaElement) mediaElementGeneration = currentTrackGeneration;

    const targetTime = (typeof initialTime === 'number' && !isNaN(initialTime) && initialTime > 0) ? initialTime : 0;
    nativeLoadOffset=targetTime;
    if (audio && !adoptNative && targetTime > 0 && audio.readyState >= 1) {
        try { audio.currentTime = targetTime; } catch (_) {}
    }
    {
        try {
            if (targetTime > 0) safeStorage.setItem('cachymusic_last_track_time', targetTime.toFixed(2));
            else safeStorage.removeItem('cachymusic_last_track_time');
        } catch (_) {}
    }

    const applyTargetTime = () => {
        if (!s.audio) return;
        if (targetTime > 0 && s.audio.duration && !isNaN(s.audio.duration) && targetTime >= (s.audio.duration - 1)) {
            s.audio.currentTime = 0;
            if (currentTimeEl) currentTimeEl.textContent = '0:00';
            if (miniCurrentTime) miniCurrentTime.textContent = '0:00';
            if (progressBar) progressBar.style.width = '0%';
            if (miniProgressBar) miniProgressBar.style.width = '0%';
            try { safeStorage.removeItem('cachymusic_last_track_time'); } catch (_) {}
            return;
        }
        try { s.audio.currentTime = targetTime; } catch (_) {}
        if (targetTime === 0) {
            if (currentTimeEl) currentTimeEl.textContent = '0:00';
            if (miniCurrentTime) miniCurrentTime.textContent = '0:00';
            if (progressBar) progressBar.style.width = '0%';
            if (miniProgressBar) miniProgressBar.style.width = '0%';
        } else {
            if (currentTimeEl) currentTimeEl.textContent = formatTime(targetTime);
            if (miniCurrentTime) miniCurrentTime.textContent = formatTime(targetTime);
            const dur = s.audio.duration || track.duration || 0;
            if (dur > 0) {
                const pct = Math.min(100, Math.max(0, (targetTime / dur) * 100));
                if (progressBar) progressBar.style.width = `${pct}%`;
                if (miniProgressBar) miniProgressBar.style.width = `${pct}%`;
            }
        }
    };

    if (activeLoadedMetadataHandler && audio) {
        try { audio.removeEventListener('loadedmetadata', activeLoadedMetadataHandler); } catch (_) {}
    }
    activeLoadedMetadataHandler = applyTargetTime;
    if (audio && !adoptNative && (!isKnownSoftware || !autoPlay) && trackSrc) {
        audio.addEventListener('loadedmetadata', applyTargetTime, { once: true });
    }

    updateEmptyPlayerState();
    updateMarqueeText(trackName, track.title ? track.title : (track.filename || 'Unknown'));
    updateMarqueeText(artistName, track.artist ? track.artist : 'Unknown');
    updateMarqueeText(albumName, track.album ? `Album: ${track.album}${track.year ? ' (' + track.year + ')' : ''}` : 'Album: Unknown');
    updateTrackBadgeUi(track);

    const coverSrc = track.cover || 'resources/images/default.svg';
    const hasCustomCover = Boolean(track.cover && !track.cover.includes('default.svg'));
    applyArtworkToDeck(coverSrc, hasCustomCover);
    appendDebugTelemetry(`[LOAD] Track #${index + 1}: "${track.title || track.filename}" (${track.format || 'AUDIO'}, ${track.sampleRate || 44100}Hz)`);

    if (coverBadge) {
        if (track.cover) {
            coverBadge.textContent = 'COVER ART';
            coverBadge.style.color = 'inherit';
        } else {
            coverBadge.textContent = 'MUSIC ICON';
            coverBadge.style.color = 'var(--text-muted)';
        }
    }

    applyTrackMetadataToDom(track, false);

    store.emit('library:render-window', { preserveScroll: true });
    const displayedIdx = findTrackIndex(s.displayedTracks, track);
    if (displayedIdx !== -1 && trackList) {
        const activeEl = trackList.querySelector(`.trackItem[data-index="${displayedIdx}"]`);
        if (activeEl) {
            activeEl.classList.add('active');
            activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } else {
            store.emit('library:scroll-to-index', { index: displayedIdx, active: true });
        }
    }

    if (targetTime > 0) {
        if (currentTimeEl) currentTimeEl.textContent = formatTime(targetTime);
        if (miniCurrentTime) miniCurrentTime.textContent = formatTime(targetTime);
        const totalSec = track.duration || 0;
        if (totalSec > 0) {
            const pct = Math.min(100, Math.max(0, (targetTime / totalSec) * 100));
            if (progressBar) progressBar.style.width = `${pct}%`;
            if (miniProgressBar) miniProgressBar.style.width = `${pct}%`;
        }
    } else {
        if (progressBar) progressBar.style.width = '0%';
        if (miniProgressBar) miniProgressBar.style.width = '0%';
        if (currentTimeEl) currentTimeEl.textContent = '0:00';
        if (miniCurrentTime) miniCurrentTime.textContent = '0:00';
    }
    if (totalDurationEl) totalDurationEl.textContent = formatTime(track.duration);
    if (miniTotalDuration) miniTotalDuration.textContent = formatTime(track.duration);
    updatePlaybackProgress(targetTime,track.duration);
    updateMiniPlayerInfo(track);
    updateLyricsDisplay(track);
    if (targetTime > 0 && s.isLyricsView) {
        updateActiveLyric(targetTime);
    }

    mediaSessionController.updateMetadata(track);
    mprisSyncHook(true);

    if(adoptNative){syncPlayPauseUI(adoptNative.state==='playing',true);startNativePoll();updateSignalPathUi(track);return;}
    if (isKnownSoftware) {
        if (autoPlay && loadPlayId===currentPlayRequestId) {
            playWithSoftwareDecoder(track, initialTime, streamFlac && !prefersSoftware);
        } else {
            s.pendingSoftwareSeekSec = initialTime > 0 ? initialTime : null;
            s.isSoftwarePaused = true;
            syncPlayPauseUI(false);
        }
        return;
    }

    if (autoPlay && loadPlayId===currentPlayRequestId) {
        playAudio();
    } else {
        pauseAudio();
    }
}

// =========================================================================
// Standalone / External File Playback Engine (VLC-Style Isolated Playback)
// =========================================================================
function updateStandaloneBannerUi(visible, track = null) {
    const banner = standaloneBanner || document.getElementById('standaloneBanner');
    const titleEl = standaloneBannerTitle || document.getElementById('standaloneBannerTitle');
    if (!banner) return;
    if (visible && track) {
        banner.style.display = 'flex';
        if (titleEl) {
            titleEl.textContent = track.title ? `${track.title}${track.artist ? ' - ' + track.artist : ''}` : (track.filename || 'Standalone Audio');
            titleEl.title = track.filename || track.title || '';
        }
    } else {
        banner.style.display = 'none';
    }
}

function exitStandalonePlayback(returnToLibrary = true) {
    const s = store.state;
    s.isStandalonePlayback = false;
    updateStandaloneBannerUi(false);
    if (returnToLibrary && s.allTracks && s.allTracks.length > 0) {
        const targetIdx = (s.currentTrackIndex >= 0 && s.currentTrackIndex < s.allTracks.length) ? s.currentTrackIndex : 0;
        loadTrack(targetIdx, s.isPlaying);
    } else {
        pauseAudio();
        updateEmptyPlayerState();
    }
}

async function loadStandaloneTrack(indexOrTrack = 0, autoPlay = true) {
    const s = store.state;
    let track = null;
    if (typeof indexOrTrack === 'number') {
        s.standaloneTrackIndex = Math.max(0, Math.min((s.standaloneTrackList.length || 1) - 1, indexOrTrack));
        track = s.standaloneTrackList[s.standaloneTrackIndex];
    } else if (indexOrTrack && typeof indexOrTrack === 'object') {
        track = indexOrTrack;
        s.standaloneTrackList = [track];
        s.standaloneTrackIndex = 0;
    }
    if (!track) return;
    const loadToken=++trackLoadToken, loadPlayId=++currentPlayRequestId;
    if(!await stopNative()||loadToken!==trackLoadToken)return;
    currentTrackGeneration++;
    if(activeLoadedMetadataHandler&&s.audio)s.audio.removeEventListener('loadedmetadata',activeLoadedMetadataHandler);abortActiveSoftwareFetch();stopSoftwarePlayback();s.activeDecodedBuffer=null;
    if(s.audio){s.audio.pause();s.audio.removeAttribute('src');s.audio.load();}
    if(s.secondaryAudio){s.secondaryAudio.pause();s.secondaryAudio.removeAttribute('src');s.secondaryAudio.load();}
    s.preloadedNextTrackIndex=-1;
    s.isStandalonePlayback = true;
    s.currentTrack = track;
    updateStandaloneBannerUi(true, track);

    if (s.isSoftwareDecoding && s.softwareSourceNode) {
        try { s.softwareSourceNode.stop(); } catch (_) {}
        s.isSoftwareDecoding = false;
    }
    if (s.softwarePlaybackRaf) {
        cancelAnimationFrame(s.softwarePlaybackRaf);
        s.softwarePlaybackRaf = null;
    }

    let trackSrc = await resolveTrackSource(track);
    if(loadToken!==trackLoadToken)return;
    releaseInactiveSources(trackSrc);
    if(!trackSrc){syncPlayPauseUI(false);showToast('Music file unavailable. Reimport or relink it.');return;}
    if (trackSrc.startsWith('../')) trackSrc = trackSrc.substring(3);
    const isKnownSoftware = shouldPreferSoftwareDecoder(track, trackSrc);
    const targetRate = track.sampleRate ? getValidSampleRate(track.sampleRate) : 44100;
    await ensureAudioEngineForSampleRate(targetRate, audioBufferChangePending());

    if(loadToken!==trackLoadToken)return;
    store.emit('track:change', { track, index: s.standaloneTrackIndex });

    const audio = s.audio;
    if (audio) {
        currentTrackGeneration++;
        audio._trackGeneration = currentTrackGeneration;
        if ((!isKnownSoftware || !autoPlay) && trackSrc) {
            audio.src = trackSrc;
            audio._isFreshTrackLoad = true;
            try { audio.load(); } catch (_) {}
        } else {
            try {
                audio.pause();
                audio.removeAttribute('src');
                audio.load();
            } catch (_) {}
        }
        audio.currentTime = 0;
    }

    if (currentTimeEl) currentTimeEl.textContent = '0:00';
    if (miniCurrentTime) miniCurrentTime.textContent = '0:00';
    if (progressBar) progressBar.style.width = '0%';
    if (miniProgressBar) miniProgressBar.style.width = '0%';

    updateEmptyPlayerState();
    if (trackName) updateMarqueeText(trackName, track.title ? track.title : (track.filename || 'Standalone Audio'));
    if (artistName) updateMarqueeText(artistName, track.artist ? track.artist : 'External File');
    if (albumName) updateMarqueeText(albumName, track.album ? `Album: ${track.album}${track.year ? ' (' + track.year + ')' : ''}` : 'Standalone File');

    updateTrackBadgeUi(track);
    const audioSrcBadge = document.getElementById('audioSourceBadge');
    if (audioSrcBadge) audioSrcBadge.textContent = 'STANDALONE';

    const coverSrc = track.cover || 'resources/images/default.svg';
    const hasCustomCover = Boolean(track.cover && !track.cover.includes('default.svg'));
    applyArtworkToDeck(coverSrc, hasCustomCover);
    appendDebugTelemetry(`[STANDALONE LOAD] "${track.title || track.filename}" (${track.format || 'AUDIO'}, ${track.sampleRate || 44100}Hz)`);

    applyTrackMetadataToDom(track, true);
    document.querySelectorAll('.trackItem.active').forEach(el => el.classList.remove('active'));

    if (totalDurationEl) totalDurationEl.textContent = formatTime(track.duration);
    if (miniTotalDuration) miniTotalDuration.textContent = formatTime(track.duration);
    updateMiniPlayerInfo(track);
    updateSignalPathUi(track);
    updateLyricsDisplay(track);

    mediaSessionController.updateMetadata(track);
    mprisSyncHook(true);

    if (isKnownSoftware) {
        if (autoPlay && loadPlayId===currentPlayRequestId) {
            playWithSoftwareDecoder(track, 0);
        } else {
            s.isSoftwarePaused = true;
            syncPlayPauseUI(false);
        }
        return;
    }

    if (autoPlay && loadPlayId===currentPlayRequestId) {
        playAudio();
    } else {
        pauseAudio();
    }
}

// Centralized Play/Pause UI Synchronizer
function syncPlayPauseUI(playing, force = false) {
    const s = store.state;
    playing = !!playing;
    if (!force && s.lastSyncedPlayingState === playing) return;
    s.lastSyncedPlayingState = playing;
    s.isPlaying = playing;
    store.emit('audio:spectrum-refresh');

    mediaSessionController.syncPlaybackState(playing);
    mprisSyncHook(true);

    if (playPauseBtn) {
        playPauseBtn.setAttribute('title', playing ? 'Pause (Space)' : 'Play (Space)');
        playPauseBtn.classList.toggle('playing', playing);
    }

    const isThematicActive = (s.activeVisualizerMode === 'thematic' || s.activeVisualizerMode === 'badapple');
    if (vinylTurntable) {
        vinylTurntable.classList.toggle('thematicFidelity', isThematicActive);
        vinylTurntable.classList.toggle('spinning', playing);
    }
    if (bgDisc) bgDisc.classList.toggle('fast', playing && isThematicActive);

    updateMiniPlayerPlayState(playing);
    document.body.classList.toggle('is-playing', playing);

    const studioStatusEl = document.getElementById('studioUserStatus');
    if (studioStatusEl) {
        const textEl = studioStatusEl.querySelector('.statusText');
        if (textEl) {
            textEl.textContent = playing ? 'PLAYING' : 'READY';
        }
    }

    if (playing) {
        store.emit('visualizer:resume');
    }
}

function updateRepeatUI() {
    const s = store.state;
    refreshNativeOrder();
    if (!repeatBtn) return;
    safeStorage.setItem('cachymusic_repeat_mode', s.repeatMode);

    if (s.repeatMode === 'one') {
        repeatBtn.classList.add('active', 'repeat-one');
        repeatBtn.setAttribute('title', 'Repeat Current Track (1) Active — Click to Turn Off');
        repeatBtn.style.opacity = '1';
        repeatBtn.innerHTML = `
            <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
                <path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/>
                <text x="12" y="12" text-anchor="middle" dominant-baseline="central" font-size="7.5" font-weight="900" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif" fill="currentColor">1</text>
            </svg>
        `;
    } else if (s.repeatMode === 'all') {
        repeatBtn.classList.add('active');
        repeatBtn.classList.remove('repeat-one');
        repeatBtn.setAttribute('title', 'Repeat All Tracks Active — Click for Repeat One');
        repeatBtn.style.opacity = '1';
        repeatBtn.innerHTML = `
            <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
                <path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/>
            </svg>
        `;
    } else {
        repeatBtn.classList.remove('active', 'repeat-one');
        repeatBtn.setAttribute('title', 'Repeat Off — Click for Repeat All');
        repeatBtn.style.opacity = '0.72';
        repeatBtn.innerHTML = `
            <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
                <path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/>
            </svg>
        `;
    }
}

// Unified Seek Helper (HTML5 <audio> and Web Audio Software Decoder)
function seekAudio(targetSec) {
    const s = store.state;
    if (typeof targetSec !== 'number' || !Number.isFinite(targetSec)) return;
    nativeLoadOffset=Math.max(0,targetSec);
    if(androidNative?.active){androidNative.command('seek',targetSec);updatePlaybackProgress(targetSec,nativeDuration());return;}
    const track = (s.isStandalonePlayback && s.standaloneTrackList.length > 0)
        ? s.standaloneTrackList[s.standaloneTrackIndex]
        : s.allTracks[s.currentTrackIndex];
    if (s.isSoftwareDecoding) {
        if (s.activeDecodedBuffer) {
            seekSoftwarePlayback(targetSec);
            mediaSessionController.updatePositionState(true);
        } else {
            const estDur = (track && Number.isFinite(track.duration) && track.duration > 0) ? track.duration : Infinity;
            const queuedTarget = Math.max(0, Math.min(estDur, targetSec));
            s.pendingSoftwareSeekSec = queuedTarget;
            updatePlaybackProgress(queuedTarget, Number.isFinite(estDur) ? estDur : 0);
        }
        return;
    }
    const audio = s.audio;
    if (!audio) return;
    const dur = (audio.duration && Number.isFinite(audio.duration))
        ? audio.duration
        : ((track && Number.isFinite(track.duration) && track.duration > 0) ? track.duration : Infinity);
    const clamped = Math.max(0, Math.min(dur, targetSec));
    const shouldKeepPlaying = !s.userExplicitlyPaused;
    clearSeekStallTimer();

    if (shouldKeepPlaying && s.audioContext && s.audioContext.state === 'suspended') {
        resumeAudioGraph().catch(() => {});
    }

    try {
        audio.currentTime = clamped;
    } catch (_) {}

    updatePlaybackProgress(clamped, Number.isFinite(dur) ? dur : 0);
    mediaSessionController.updatePositionState(true);
    mprisSyncHook(true);

    if (shouldKeepPlaying) {
        if (audio.paused) {
            s.isPlayPending = false;
            playAudio(true);
        }
        const seekGen = currentTrackGeneration;
        seekStallTimer = setTimeout(() => {
            seekStallTimer = null;
            if (seekGen !== currentTrackGeneration) return;
            if (s.userExplicitlyPaused || s.isSoftwareDecoding || s.audio !== audio || !track) return;
            const stillStalled = audio.seeking || audio.readyState < 3 || audio.paused;
            if (stillStalled) logAudioPlaybackEvent('warn', `Seek pending at ${clamped.toFixed(1)}s; waiting for streaming decoder.`);
        }, 1600);
    }
}

// Play Audio (guarded against concurrent async race conditions and AbortError)
async function playAudio(userInitiated = false) {
    if (userInitiated) explicitTransportVersion++;
    const s = store.state;
    if(nativeReleasing)return;
    let skipNative=false;
    if(androidNative?.active){
        const status=androidNative.read();
        if(status?.state==='error'||status?.state==='unconfirmed'){if(!await stopNative())return;skipNative=true;}
        else {s.userExplicitlyPaused=false;androidNative.command('play');return;}
    }
    if (s.isSoftwareDecoding) {
        s.userExplicitlyPaused = false;
        s.isSoftwarePaused=false;
        if(s.activeDecodedBuffer){if(!pcmStream){syncPlayPauseUI(true);resumeSoftwarePlayback();}}
        return;
    }

    const currentTrack = (s.isStandalonePlayback && s.standaloneTrackList.length > 0)
        ? s.standaloneTrackList[s.standaloneTrackIndex]
        : s.allTracks[s.currentTrackIndex];
    if(!skipNative&&!s.isStandalonePlayback&&nativeEligible(currentTrack)){
        const offset=s.audio?.readyState>=1?s.audio.currentTime||0:nativeLoadOffset;
        ++currentPlayRequestId;s.isPlayPending=false;clearNoDataStallTimer();clearSeekStallTimer();
        if(s.audio)s.audio.pause();if(s.secondaryAudio)s.secondaryAudio.pause();
        s.userExplicitlyPaused=false;
        if (androidNative.supportsQueue) s.playQueue = identifyQueueEntries(s.playQueue);
        const order = androidNative.supportsOrder && s.sleepTimerMode !== 'end'
            ? token => androidNative.buildOrder(s, token, nativeQueueEdits)
            : null;
        if (androidNative.start(currentTrack, offset, nativeGain(), order)) {
            nativeAttemptGeneration = currentTrackGeneration;
            rememberNativeQueue(androidNative.token);
            nativeOrderInputs = nativeOrderKey(androidNative.last);
            nativeEndedToken = '';
            nativeLastGain = nativeGain();
            startNativePoll();
            updateSignalPathUi(currentTrack);
            return;
        }
        showToast('Native service could not start; using regular playback.');
    }
    const currentSrc = currentTrack ? (currentTrack.src || '') : '';
    const cleanSrc = currentSrc.startsWith('../') ? currentSrc.substring(3) : currentSrc;
    const isKnownSoftware = shouldPreferSoftwareDecoder(currentTrack, cleanSrc);
    const directFlac = mediaElementGeneration !== currentTrackGeneration && shouldStreamAndroidFlac(currentTrack);

    if ((isKnownSoftware || directFlac) && !s.isSoftwareDecoding) {
        s.userExplicitlyPaused = false;
        syncPlayPauseUI(true);
        const startOffset = Number.isFinite(s.pendingSoftwareSeekSec) ? s.pendingSoftwareSeekSec : (s.audio?.currentTime||0);
        playWithSoftwareDecoder(currentTrack, startOffset, directFlac && !isKnownSoftware);
        return;
    }

    const audio = s.audio;
    if (!audio || !audio.src || audio.src === window.location.href) {
        syncPlayPauseUI(false);
        return;
    }
    if (s.isPlayPending) {
        return;
    }

    const reqId = ++currentPlayRequestId;
    s.userExplicitlyPaused = false;
    s.isPlayPending = true;
    clearNoDataStallTimer();
    if (playPendingTimeout) clearTimeout(playPendingTimeout);
    playPendingTimeout = setTimeout(() => {
        if (s.isPlayPending && reqId === currentPlayRequestId) {
            s.isPlayPending = false;
        }
    }, 4000);

    syncPlayPauseUI(true);

    const scheduleNoDataFallback = (targetAudio) => {
        clearNoDataStallTimer();
        if (!targetAudio || !currentTrack || s.userExplicitlyPaused || s.isSoftwareDecoding) return;
        const startTimeAtSchedule = targetAudio.currentTime || 0;
        const onAdvance = () => {
            if (!targetAudio || targetAudio !== s.audio) return;
            if ((targetAudio.currentTime || 0) > startTimeAtSchedule + 0.04) {
                clearNoDataStallTimer();
            }
        };
        targetAudio.addEventListener('timeupdate', onAdvance);
        removeNoDataListener = () => targetAudio.removeEventListener('timeupdate', onAdvance);
        noDataStallTimer = setTimeout(() => {
            clearNoDataStallTimer();
            if (reqId !== currentPlayRequestId || s.userExplicitlyPaused || s.isSoftwareDecoding || s.audio !== targetAudio) return;
            const timeStalled = Math.abs((targetAudio.currentTime || 0) - startTimeAtSchedule) < 0.04;
            if ((targetAudio.readyState === 0 || timeStalled) && !targetAudio.ended) {
                logAudioPlaybackEvent('warn', 'Waiting for native decoder data; no automatic full-file decode on a slow start.');
            }
        }, 6000);
    };

    try {
        const track = s.allTracks[s.currentTrackIndex];
        const targetRate = (track && track.sampleRate) ? getValidSampleRate(track.sampleRate) : 44100;
        // Join any pending replacement rather than playing into a graph that
        // may be closing. The owner handles reuse without rebuilding.
        const graph = await ensureAudioEngineForSampleRate(targetRate);
        if (reqId !== currentPlayRequestId) return;
        if (!graph && s.audioContext) throw new Error('Audio graph could not be initialized. Retry playback.');
        if (s.audioContext && s.audioContext.state !== 'running') {
            try {
                await Promise.race([
                    resumeAudioGraph(),
                    new Promise(resolve => setTimeout(resolve, 300))
                ]);
            } catch (_) {}
        }
        if (reqId !== currentPlayRequestId) return;
        const activeAudio = s.audio;
        if (activeAudio.muted) activeAudio.muted = false;
        if (activeAudio.volume === 0 && s.currentVolumeValue > 0) {
            activeAudio.volume = s.isHardwareGain ? 1.0 : Math.min(1.0, s.currentVolumeValue);
        }

        if (activeAudio.error && !activeAudio._isFreshTrackLoad) {
            const isDecodeErr = (activeAudio.error.code === 3);
            const resumeTime = isDecodeErr ? 0 : (activeAudio.currentTime || 0);
            const reloadSrc = activeAudio.src;
            activeAudio.src = reloadSrc;
            activeAudio.load();
            if (resumeTime > 0) {
                try { activeAudio.currentTime = resumeTime; } catch (_) {}
            }
        }
        activeAudio._isFreshTrackLoad = false;

        scheduleNoDataFallback(activeAudio);
        await activeAudio.play();
        if (reqId !== currentPlayRequestId) return;
        syncPlayPauseUI(!activeAudio.paused);
    } catch (err) {
        clearNoDataStallTimer();
        if (reqId !== currentPlayRequestId) return;
        const errCode = s.audio && s.audio.error ? s.audio.error.code : 0;
        const shouldSoftwareFallback = !s.userExplicitlyPaused && currentTrack && !s.isSoftwareDecoding
            && (err.name === 'NotSupportedError' || errCode === 3 || errCode === 4);
        if (shouldSoftwareFallback) {
            const rawSrc = (s.audio && (s.audio.getAttribute('src') || s.audio.src)) || '';
            rememberSoftwareDecoder(rawSrc);
            rememberSoftwareDecoder(currentTrack.src);
            try {
                if (s.audio) {
                    s.audio.pause();
                    s.audio.removeAttribute('src');
                    s.audio.load();
                }
            } catch (_) {}
            logAudioPlaybackEvent('info', `HTML5 play() rejected (${err.name || 'code ' + errCode}) on "${currentTrack.title || currentTrack.filename}". Switching to 32-bit Web Audio Software Engine.`);
            playWithSoftwareDecoder(currentTrack, (s.audio && s.audio.currentTime) || 0);
            return;
        }
        if (err.name !== 'AbortError') {
            console.warn('Audio playback error:', err);
        }
        if (s.audio && s.audio.paused) {
            syncPlayPauseUI(false);
        }
    } finally {
        if (reqId === currentPlayRequestId) {
            if (playPendingTimeout) {
                clearTimeout(playPendingTimeout);
                playPendingTimeout = null;
            }
            s.isPlayPending = false;
        }
    }
}

function pauseAudio() {
    const s = store.state;
    s.userExplicitlyPaused = true;
    currentPlayRequestId++; s.isPlayPending=false;
    clearNoDataStallTimer();
    clearSeekStallTimer();
    if(androidNative?.active){androidNative.command('pause');syncPlayPauseUI(false);return;}
    if (s.isSoftwareDecoding) {
        pauseSoftwarePlayback();
        syncPlayPauseUI(false);
        return;
    }
    try {
        if (s.audio) s.audio.pause();
    } catch (err) {
        console.warn('Audio pause error:', err);
    }
    syncPlayPauseUI(false);
}

function togglePlayPause() {
    const s = store.state;
    if(androidNative?.active){const state=androidNative.read()?.state;if(['playing','loading','seeking'].includes(state))pauseAudio();else playAudio(true);return;}
    if (s.isSoftwareDecoding) {
        if (!s.isSoftwarePaused) {
            s.userExplicitlyPaused = true;
            pauseAudio();
        } else {
            s.userExplicitlyPaused = false;
            playAudio(true);
        }
        return;
    }
    const audio = s.audio;
    if (!audio || !audio.src || audio.src === window.location.href) {
        if (s.allTracks && s.allTracks.length > 0) {
            const targetIdx = (s.currentTrackIndex >= 0 && s.allTracks[s.currentTrackIndex]) ? s.currentTrackIndex : 0;
            loadTrack(targetIdx, true);
            return;
        }
        syncPlayPauseUI(false);
        return;
    }
    if (!audio.paused) {
        s.userExplicitlyPaused = true;
        pauseAudio();
    } else if (!s.isPlayPending) {
        s.userExplicitlyPaused = false;
        playAudio(true);
    }
}

// =========================================================================
// Best-effort next-track element preloading (not sample-accurate gapless)
// =========================================================================
function peekNextTrackIndex() {
    const s = store.state;
    if (s.playQueue && s.playQueue.length > 0) {
        const queued = s.playQueue[0];
        const qIdx = findTrackIndex(s.allTracks, queued);
        if (qIdx !== -1) return qIdx;
    }

    const pool = s.displayedTracks.length > 0 ? s.displayedTracks : s.allTracks;
    if (pool.length === 0) return -1;

    const currentIdxInPool = findTrackIndex(pool, s.allTracks[s.currentTrackIndex]);

    if (currentIdxInPool === -1) return -1;
    if (s.isShuffle && pool.length > 1) return -1;

    let nextIdx = currentIdxInPool + 1;
    if (nextIdx >= pool.length) {
        if (s.repeatMode === 'off') return -1;
        nextIdx = 0;
    }

    const target = pool[nextIdx];
    return findTrackIndex(s.allTracks, target);
}

async function checkAndPreloadNextTrack(currentTime, duration) {
    const rt = getRuntime();
    if (rt.isAndroidNative || rt.osFamily==='android' || window.innerWidth<=768 || store.state.isStandalonePlayback || store.state.isSoftwareDecoding) return;
    if (!duration || isNaN(duration) || duration < 8 || store.state.sleepTimerMode === 'end') return;
    const s = store.state;
    if (duration - currentTime <= 5.0) {
        const nextMasterIdx = peekNextTrackIndex();
        if (nextMasterIdx !== -1 && nextMasterIdx !== s.preloadedNextTrackIndex && s.allTracks[nextMasterIdx]) {
            s.preloadedNextTrackIndex = nextMasterIdx;
            const nextTr = s.allTracks[nextMasterIdx];
            const generation=currentTrackGeneration;
            let nextSrc=await resolveTrackSource(nextTr);
            if(generation!==currentTrackGeneration||s.preloadedNextTrackIndex!==nextMasterIdx)return;
            if (nextSrc.startsWith('../')) nextSrc = nextSrc.substring(3);
            if (!nextSrc){s.preloadedNextTrackIndex=-1;return;}

            if (!s.secondaryAudio) {
                s.secondaryAudio = document.createElement('audio');
                s.secondaryAudio.preload = 'auto';
                s.secondaryAudio.crossOrigin = 'anonymous';
            }
            s.secondaryAudio.src = nextSrc;
            releaseInactiveSources(s.audio?.getAttribute('src'),nextSrc);
            try { s.secondaryAudio.load(); } catch (_) {}
        }
    }
}

function executeGaplessHandoff(nextIndex) {
    if (audioBufferChangePending()) return false;
    const rt = getRuntime();
    if (rt.isAndroidNative || rt.osFamily==='android' || window.innerWidth<=768 || store.state.isSoftwareDecoding) return false;
    const s = store.state;
    if (!s.secondaryAudio || s.preloadedNextTrackIndex !== nextIndex || s.secondaryAudio.readyState < 2) {
        return false;
    }
    try {
        const oldAudio = s.audio;
        ++trackLoadToken; currentTrackGeneration++; currentPlayRequestId++;
        s.secondaryAudio._trackGeneration=currentTrackGeneration;
        s.secondaryAudio.volume = oldAudio.volume;
        s.secondaryAudio.muted = oldAudio.muted;
        try {
            s.secondaryAudio.playbackRate = s.currentPlaybackSpeed || oldAudio.playbackRate || 1.0;
            s.secondaryAudio.preservesPitch = s.isPitchLockTempo;
            s.secondaryAudio.mozPreservesPitch = s.isPitchLockTempo;
            s.secondaryAudio.webkitPreservesPitch = s.isPitchLockTempo;
        } catch (_) {}

        s.audio = s.secondaryAudio;
        s.secondaryAudio = oldAudio;
        s.currentTrackIndex = nextIndex;
        s.preloadedNextTrackIndex = -1;
        s.trackPlaybackRetryCount = 0;

        oldAudio.pause();
        oldAudio.removeAttribute('src');
        oldAudio.load();
        releaseInactiveSources(s.audio.getAttribute('src'));

        if (s.audioSourceNode) {
            try { s.audioSourceNode.disconnect(); } catch (_) {}
            s.audioSourceNode = null;
        }

        attachAudioListeners(s.audio);
        getOrCreateAudioSourceNode();
        updateAudioRouting();

        const nextTr = s.allTracks[s.currentTrackIndex];
        s.currentTrack = nextTr;
        rememberTrack(safeStorage, nextTr);
        store.emit('track:change', { track: nextTr, index: nextIndex });

        s.userExplicitlyPaused = false;
        const handoffGeneration=currentTrackGeneration;
        s.audio.play().then(() => {
            if(handoffGeneration!==currentTrackGeneration)return;
            syncPlayPauseUI(true);
            store.emit('visualizer:resume');
        }).catch(console.warn);

        if (nextTr) {
            if (trackName) updateMarqueeText(trackName, nextTr.title ? nextTr.title : (nextTr.filename || 'Unknown'));
            if (artistName) updateMarqueeText(artistName, nextTr.artist ? nextTr.artist : 'Unknown');
            if (albumName) updateMarqueeText(albumName, nextTr.album ? `Album: ${nextTr.album}${nextTr.year ? ' (' + nextTr.year + ')' : ''}` : 'Album: Unknown');
            updateTrackBadgeUi(nextTr);
            const coverSrc = nextTr.cover || 'resources/images/default.svg';
            const hasCustomCover = Boolean(nextTr.cover && !nextTr.cover.includes('default.svg'));
            applyArtworkToDeck(coverSrc, hasCustomCover);
            applyTrackMetadataToDom(nextTr, false);
            updateSignalPathUi(nextTr);
            updateLyricsDisplay(nextTr);
            updateMiniPlayerInfo(nextTr);
            mediaSessionController.updateMetadata(nextTr);
            store.emit('library:render-window', { preserveScroll: true });
        }
        return true;
    } catch (e) {
        console.warn('Gapless handoff fallback:', e);
        return false;
    }
}

function sendNativeShuffleCommand(status, command) {
    const s = store.state;
    if (!status || status.state === 'stopped' || status.state === 'unconfirmed'
        || !androidNative.supportsShuffle || !s.isShuffle || !nativeEligible(s.allTracks[s.currentTrackIndex])) return false;
    refreshNativeOrder(status);
    return androidNative.command(command);
}

async function nextTrack(manual = true, allowNative = true) {
    const s = store.state;
    const native = androidNative?.read();
    if (nativeReleasing || !syncNativeTrack(native)) return;
    reconcileNativeQueue(native);
    if (manual && allowNative && sendNativeShuffleCommand(native, 'next')) return;
    if (native && native.state !== 'stopped' && androidNative.supportsQueue && s.playQueue.length) {
        const loadToken = trackLoadToken;
        if (!await stopNative() || loadToken !== trackLoadToken) return;
        const stopped = androidNative.snapshot();
        if (stopped?.token === native.token && stopped.revision !== native.revision) {
            // A service advance during the stop handshake already took the next entry.
            const index = s.allTracks.findIndex(track => indexedSource(track) === stopped.uri);
            if (index >= 0) {
                loadTrack(index, true, Number(stopped.position || 0) / 1000);
                return;
            }
        }
    }
    clearSeekStallTimer();
    if (manual) {
        s.userExplicitlyPaused = false;
        s.isPlayPending = false;
    }
    if (s.isStandalonePlayback && s.standaloneTrackList && s.standaloneTrackList.length > 0) {
        if (s.repeatMode === 'one' && !manual) {
            seekAudio(0);
            playAudio(true);
            return;
        }
        if (s.standaloneTrackList.length > 1 && (s.standaloneTrackIndex + 1 < s.standaloneTrackList.length || s.repeatMode === 'all' || manual)) {
            s.standaloneTrackIndex = (s.standaloneTrackIndex + 1) % s.standaloneTrackList.length;
            loadStandaloneTrack(s.standaloneTrackIndex, true);
        } else if (s.repeatMode === 'all' || manual) {
            seekAudio(0);
            playAudio(true);
        } else {
            pauseAudio();
            seekAudio(0);
        }
        return;
    }

    if (s.playQueue && s.playQueue.length > 0) {
        const nextQueuedTrack = s.playQueue.shift();
        store.emit('library:update-queue');
        const masterIdx = findTrackIndex(s.allTracks, nextQueuedTrack);
        if (masterIdx !== -1) {
            if (!executeGaplessHandoff(masterIdx)) {
                loadTrack(masterIdx, true);
            }
            return;
        }
    }

    const pool = s.displayedTracks.length > 0 ? s.displayedTracks : s.allTracks;
    if (pool.length === 0) return;

    const currentIdxInPool = findTrackIndex(pool, s.allTracks[s.currentTrackIndex]);

    if (s.isShuffle && pool.length > 1) {
        let nextIdx = Math.floor(Math.random() * pool.length);
        let attempts = 0;
        while (nextIdx === currentIdxInPool && attempts < 10) {
            nextIdx = Math.floor(Math.random() * pool.length);
            attempts++;
        }
        const masterIdx = findTrackIndex(s.allTracks, pool[nextIdx]);
        if (masterIdx !== -1 && !executeGaplessHandoff(masterIdx)) {
            loadTrack(masterIdx, true);
        }
    } else {
        let nextIdx = currentIdxInPool + 1;
        if (nextIdx >= pool.length) {
            if (!manual && s.repeatMode === 'off') {
                pauseAudio();
                seekAudio(0);
                if (progressBar) progressBar.style.width = '0%';
                if (currentTimeEl) currentTimeEl.textContent = '0:00';
                return;
            }
            nextIdx = 0;
        }
        const masterIdx = findTrackIndex(s.allTracks, pool[nextIdx]);
        if (masterIdx !== -1 && !executeGaplessHandoff(masterIdx)) {
            loadTrack(masterIdx, true);
        }
    }
}

function prevTrack(allowNative = true) {
    const s = store.state;
    const native = androidNative?.read();
    if (nativeReleasing || !syncNativeTrack(native)) return;
    if (allowNative && sendNativeShuffleCommand(native, 'prev')) return;
    clearSeekStallTimer();
    s.userExplicitlyPaused = false;
    s.isPlayPending = false;
    const curPos = nativePosition() ?? (s.isSoftwareDecoding ? softwarePosition() : (s.audio ? s.audio.currentTime : 0));

    if (s.isStandalonePlayback && s.standaloneTrackList && s.standaloneTrackList.length > 0) {
        if (curPos > 3) {
            seekAudio(0);
            playAudio(true);
        } else if (s.standaloneTrackList.length > 1) {
            s.standaloneTrackIndex = (s.standaloneTrackIndex - 1 + s.standaloneTrackList.length) % s.standaloneTrackList.length;
            loadStandaloneTrack(s.standaloneTrackIndex, true);
        } else {
            seekAudio(0);
            playAudio(true);
        }
        return;
    }

    if (curPos > 3) {
        seekAudio(0);
        playAudio(true);
        return;
    }

    const pool = s.displayedTracks.length > 0 ? s.displayedTracks : s.allTracks;
    if (pool.length === 0) return;

    const currentIdxInPool = findTrackIndex(pool, s.allTracks[s.currentTrackIndex]);
    let prevIdx = currentIdxInPool - 1;
    if (prevIdx < 0) prevIdx = pool.length - 1;
    const masterIdx = findTrackIndex(s.allTracks, pool[prevIdx]);
    if (masterIdx !== -1) loadTrack(masterIdx, true);
}

// =========================================================================
// Universal Web Audio Software Decoder Engine (Zero-Skip Hybrid Pipeline)
// =========================================================================
function updatePlaybackProgress(cur, dur) {
    const s = store.state;
    if (s.isDraggingScrubber) return;
    const currentTrack = (s.isStandalonePlayback && s.standaloneTrackList.length > 0)
        ? s.standaloneTrackList[s.standaloneTrackIndex]
        : s.allTracks[s.currentTrackIndex];
    if (!isFinite(dur) || isNaN(dur) || dur <= 0) {
        if (currentTrack && currentTrack.duration && isFinite(currentTrack.duration)) {
            dur = Number(currentTrack.duration);
        }
    }
    const formattedTime = formatTime(cur);
    if (currentTimeEl && currentTimeEl.textContent !== formattedTime) currentTimeEl.textContent = formattedTime;
    if (miniCurrentTime && miniCurrentTime.textContent !== formattedTime) miniCurrentTime.textContent = formattedTime;
    const valid=Number.isFinite(dur)&&dur>0, max=valid?Math.ceil(dur):0, now=Math.max(0,Math.min(max,Math.floor(Number.isFinite(cur)?cur:0)));
    for(const control of [document.getElementById('progressCon'),document.getElementById('miniProgressCon')]){
        if(!control)continue;
        const values={'aria-valuemax':String(max),'aria-valuenow':String(now),'aria-valuetext':`${formatTime(now)} of ${formatTime(max)}`,'aria-disabled':String(!valid)};
        for(const [key,value] of Object.entries(values))if(control.getAttribute(key)!==value)control.setAttribute(key,value);
    }

    if (dur && isFinite(dur) && dur > 0) {
        const pct = Math.min(100, Math.max(0, (cur / dur) * 100));
        if (progressBar) progressBar.style.width = `${pct}%`;
        if (miniProgressBar) miniProgressBar.style.width = `${pct}%`;
    }

    if (cur > 1.0 && s.consecutiveSkipCount > 0) {
        s.consecutiveSkipCount = 0;
    }

    if (s.isLyricsView) {
        updateActiveLyric(cur);
    }
}

function startSoftwareProgressLoop() {
    const s = store.state;
    cancelSoftwareProgressLoop();
    let lastProgressFrame = -Infinity;
    function tick(now) {
        if (!s.isSoftwareDecoding || s.isSoftwarePaused || !s.activeDecodedBuffer) return;
        const cur = softwarePosition();
        const dur = s.activeDecodedBuffer.duration;
        if (now - lastProgressFrame >= 33 || cur >= dur) {
            lastProgressFrame = now;
            updatePlaybackProgress(cur, dur);
            mediaSessionController.updatePositionState(false);
        }
        if (cur >= dur && !s.activeDecodedBuffer.streaming) {
            onSoftwarePlaybackEnded();
            return;
        }
        s.softwarePlaybackRaf = requestAnimationFrame(tick);
    }
    s.softwarePlaybackRaf = requestAnimationFrame(tick);
}

function cancelSoftwareProgressLoop() {
    const s = store.state;
    if (s.softwarePlaybackRaf) {
        cancelAnimationFrame(s.softwarePlaybackRaf);
        s.softwarePlaybackRaf = null;
    }
}

function startSoftwareBufferPlayback() {
    const s = store.state;
    if (!s.audioContext || !s.activeDecodedBuffer) return;
    if (s.activeDecodedBuffer.streaming) {startPcmPlayback();return;}
    if (s.softwareSourceNode) {
        try {
            s.softwareSourceNode.onended = null;
            s.softwareSourceNode.stop();
            s.softwareSourceNode.disconnect();
        } catch (_) {}
        s.softwareSourceNode = null;
    }

    s.softwareSourceNode = s.audioContext.createBufferSource();
    s.softwareSourceNode.buffer = s.activeDecodedBuffer;

    if (!s.softwareSourceGainNode || s.softwareSourceGainNode.context !== s.audioContext) {
        s.softwareSourceGainNode = s.audioContext.createGain();
    }
    s.softwareSourceNode.connect(s.softwareSourceGainNode);
    updateAudioRouting();

    s.softwarePlaybackStartTime = s.audioContext.currentTime;
    s.softwareSourceNode.start(0, s.softwarePlaybackOffset);
    s.isSoftwarePaused = false;
    syncPlayPauseUI(true);
    startSoftwareProgressLoop();

    s.softwareSourceNode.onended = () => {
        if (!s.isSoftwareDecoding || s.isSoftwarePaused) return;
        const cur = softwarePosition();
        if (s.activeDecodedBuffer && cur >= (s.activeDecodedBuffer.duration - 0.5)) {
            onSoftwarePlaybackEnded();
        }
    };
}

function pauseSoftwarePlayback() {
    const s = store.state;
    if (!s.isSoftwareDecoding || s.isSoftwarePaused) return;
    cancelSoftwareProgressLoop();
    s.softwarePlaybackOffset = softwarePosition();
    s.softwarePlaybackStartTime=0;
    stopPcmStream();
    if (s.softwareSourceNode) {
        try {
            s.softwareSourceNode.onended = null;
            s.softwareSourceNode.stop();
            s.softwareSourceNode.disconnect();
        } catch (_) {}
        s.softwareSourceNode = null;
    }
    s.isSoftwarePaused = true;
    syncPlayPauseUI(false);
}

function resumeSoftwarePlayback() {
    const s = store.state;
    if (!s.isSoftwareDecoding || !s.activeDecodedBuffer) return;
    if (s.audioContext && s.audioContext.state !== 'running') {
        resumeAudioGraph().catch(() => {});
    }
    startSoftwareBufferPlayback();
}

function seekSoftwarePlayback(targetSec) {
    const s = store.state;
    if (!s.isSoftwareDecoding || !s.activeDecodedBuffer) return;
    const dur = s.activeDecodedBuffer.duration;
    s.softwarePlaybackOffset = Math.max(0, Math.min(dur, targetSec));
    if (!s.isSoftwarePaused) {
        startSoftwareBufferPlayback();
    } else {
        updatePlaybackProgress(s.softwarePlaybackOffset, dur);
    }
}

function stopSoftwarePlayback() {
    const s = store.state;
    clearSeekStallTimer();
    abortActiveSoftwareFetch();
    stopPcmStream();pcmFile=null;
    cancelSoftwareProgressLoop();
    if (s.softwareSourceNode) {
        try {
            s.softwareSourceNode.onended = null;
            s.softwareSourceNode.stop();
            s.softwareSourceNode.disconnect();
        } catch (_) {}
        s.softwareSourceNode = null;
    }
    s.isSoftwareDecoding = false;
    s.isSoftwarePaused = false;
    s.pendingSoftwareSeekSec = null;
    s.softwarePlaybackStartTime = 0;
    s.softwarePlaybackOffset = 0;
    updateAudioRouting();
}

function onSoftwarePlaybackEnded() {
    const s = store.state;
    // Keep the descriptor until a new track takes ownership. Repeat/last-track
    // controls must still be able to restart a software source after completion.
    stopPcmStream();cancelSoftwareProgressLoop();
    if(s.softwareSourceNode){s.softwareSourceNode.onended=null;try{s.softwareSourceNode.stop();s.softwareSourceNode.disconnect();}catch(_){}s.softwareSourceNode=null;}
    s.isSoftwarePaused=true;s.softwarePlaybackStartTime=0;
    s.softwarePlaybackOffset=s.activeDecodedBuffer?.duration||0;syncPlayPauseUI(false);
    if (!s.isStandalonePlayback) { try { safeStorage.removeItem('cachymusic_last_track_time'); } catch (_) {} }
    if(s.sleepTimerMode==='end'){cancelSleepTimer(false);s.userExplicitlyPaused=true;showToast('Sleep timer: End of track reached. Playback paused.');return;}
    if(s.repeatMode==='one'){seekSoftwarePlayback(0);playAudio(true);}else nextTrack(false);
}

function stripId3ToFlacMagic(arrayBuffer) {
    if (!arrayBuffer || arrayBuffer.byteLength < 16) return null;
    const bytes = new Uint8Array(arrayBuffer);
    // Only scan when file begins with ID3v2 header ('I','D','3')
    if (bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) return null;
    // Syncsafe ID3v2 tag size + 10-byte header
    let startOffset = 10 + ((bytes[6] & 0x7f) << 21) + ((bytes[7] & 0x7f) << 14) + ((bytes[8] & 0x7f) << 7) + (bytes[9] & 0x7f);
    if (startOffset + 4 <= bytes.length
        && bytes[startOffset] === 0x66 && bytes[startOffset + 1] === 0x4c
        && bytes[startOffset + 2] === 0x61 && bytes[startOffset + 3] === 0x43) {
        return arrayBuffer.slice(startOffset);
    }
    const scanLimit = Math.min(bytes.length - 4, 262144);
    for (let i = 10; i < scanLimit; i++) {
        if (bytes[i] === 0x66 && bytes[i + 1] === 0x4c && bytes[i + 2] === 0x61 && bytes[i + 3] === 0x43) {
            return arrayBuffer.slice(i);
        }
    }
    return null;
}

async function decodeBufferWithAudioContext(ctx, rawArrayBuf) {
    const attemptDecode = (buf) => new Promise((resolve, reject) => {
        const p = ctx.decodeAudioData(
            buf,
            decoded => resolve(decoded),
            err => reject(err || new Error('decodeAudioData callback returned error'))
        );
        if (p && typeof p.then === 'function') {
            p.then(resolve, reject);
        }
    });
    const head = rawArrayBuf && rawArrayBuf.byteLength >= 16 ? new Uint8Array(rawArrayBuf, 0, 3) : null;
    const hasId3Header = Boolean(head && head[0] === 0x49 && head[1] === 0x44 && head[2] === 0x33);
    if (hasId3Header) {
        const stripped = stripId3ToFlacMagic(rawArrayBuf);
        if (stripped) {
            logAudioPlaybackEvent('info', 'Stripped prepended ID3v2 tag wrapper before fLaC sync frame for software decoder.');
            return await attemptDecode(stripped);
        }
    }
    // Zero-copy decode avoids duplicating large 50-90MB FLAC ArrayBuffers on 4GB devices
    return await attemptDecode(rawArrayBuf);
}

async function playWithSoftwareDecoder(track, startTime = 0, retryWebStream = false) {
    const s = store.state;
    if (!track) return;
    clearNoDataStallTimer();
    abortActiveSoftwareFetch();
    const decodeGen = currentTrackGeneration;
    stopPcmStream();pcmFile=null;
    s.activeDecodedBuffer = null;
    s.isSoftwareDecoding = true;
    s.isSoftwarePaused = false;
    s.userExplicitlyPaused = false;
    syncPlayPauseUI(true);

    try {
        if (s.audio) {
            try {
                s.audio.pause();
                s.audio.removeAttribute('src');
                s.audio.load();
            } catch (_) {}
        }

        const localFileJob = resolveLocalFile(track);
        const streamJob = localFileJob.then(file => {
            if (typeof Worker !== 'function' || !pcmExtension(track, file)) return null;
            return preparePcmInput(track, file);
        }).catch(error => ({ error }));
        const targetRate = track.sampleRate ? getValidSampleRate(track.sampleRate) : 44100;
        const graph = await ensureAudioEngineForSampleRate(targetRate);
        if (decodeGen !== currentTrackGeneration) return;
        if (!graph) throw new Error('Software playback requires a ready audio graph.');
        if (s.audioContext && s.audioContext.state !== 'running') {
            try {
                await Promise.race([
                    resumeAudioGraph(),
                    new Promise(resolve => setTimeout(resolve, 250))
                ]);
            } catch (_) {}
        }

        let src = track.src || '';
        if (src.startsWith('../')) src = src.substring(3);
        const ctxRate = s.audioContext ? s.audioContext.sampleRate : targetRate;
        const localFile = await localFileJob;
        const prepared = await streamJob;
        if(decodeGen!==currentTrackGeneration||!s.isSoftwareDecoding)return;
        if (prepared?.error) {
            logAudioPlaybackEvent('warn', `Could not open the incremental audio stream: ${prepared.error.message}`);
        } else if (prepared) {
            const { file, format } = prepared;
            pcmFile = file;
            s.activeDecodedBuffer = format;
            track.duration = format.duration;
            if (totalDurationEl) totalDurationEl.textContent = formatTime(format.duration);
            if (miniTotalDuration) miniTotalDuration.textContent = formatTime(format.duration);
            const requested = Number.isFinite(s.pendingSoftwareSeekSec) ? s.pendingSoftwareSeekSec : startTime;
            s.pendingSoftwareSeekSec = null;
            s.softwarePlaybackOffset = Math.max(0, Math.min(format.duration, requested));
            if (s.userExplicitlyPaused || s.isSoftwarePaused) {
                s.isSoftwarePaused = true;
                syncPlayPauseUI(false);
            } else startSoftwareBufferPlayback();
            return;
        }
        if (retryWebStream) {
            const offset = Number.isFinite(s.pendingSoftwareSeekSec) ? s.pendingSoftwareSeekSec : startTime;
            loadTrack(s.currentTrackIndex, !s.userExplicitlyPaused, offset, null, true);
            return;
        }
        validateDecodeBudget(track, ctxRate);
        if (Number(localFile?.size || track.size) > MAX_COMPRESSED_BYTES) throw new DecodeBudgetError('compressed');
        const cacheKey = src ? `${src}@${ctxRate}` : '';
        let decodedBuffer = (cacheKey && softwareBufferCache.has(cacheKey))
            ? softwareBufferCache.get(cacheKey)
            : null;

        if (!decodedBuffer) {
            logAudioPlaybackEvent('info', `Fetching stream bitstream for 32-bit software decode: "${track.title || track.filename}"`);
            const abortCtrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
            activeDecodeAbortController = abortCtrl;

            let arrayBuf = null;
            const file = localFile;
            if (file) {
                arrayBuf = await file.arrayBuffer();
            } else {
                const res = await fetch(src, abortCtrl ? { signal: abortCtrl.signal } : undefined);
                arrayBuf = await readBoundedAudio(res);
            }
            if (activeDecodeAbortController === abortCtrl) activeDecodeAbortController = null;
            if (decodeGen !== currentTrackGeneration || !s.isSoftwareDecoding) return;

            logAudioPlaybackEvent('info', `Decompressing bitstream into 32-bit floating point audio buffer (${(arrayBuf.byteLength / (1024 * 1024)).toFixed(2)} MB)...`);
            softwareBufferCache.clear(); // Avoid retaining a prior decoded track during allocation.
            decodedBuffer = await decodeBufferWithAudioContext(s.audioContext, arrayBuf);
            if(decodedBuffer.length*decodedBuffer.numberOfChannels*4>MAX_PCM_BYTES)throw new DecodeBudgetError('decoded');
            arrayBuf = null;
            if (decodeGen !== currentTrackGeneration || !s.isSoftwareDecoding) return;
            if (cacheKey) cacheSoftwareAudioBuffer(cacheKey, decodedBuffer);
        } else {
            logAudioPlaybackEvent('info', `Playing cached 32-bit PCM buffer instantly: "${track.title || track.filename}"`);
        }

        s.activeDecodedBuffer = decodedBuffer;

        track.duration = decodedBuffer.duration;
        if (totalDurationEl) totalDurationEl.textContent = formatTime(decodedBuffer.duration);
        if (miniTotalDuration) miniTotalDuration.textContent = formatTime(decodedBuffer.duration);

        const requestedStart = Number.isFinite(s.pendingSoftwareSeekSec) ? s.pendingSoftwareSeekSec : startTime;
        s.pendingSoftwareSeekSec = null;
        s.softwarePlaybackOffset = Math.max(0, Math.min(decodedBuffer.duration, requestedStart));
        if (s.userExplicitlyPaused || s.isSoftwarePaused) {s.isSoftwarePaused=true;syncPlayPauseUI(false);} else startSoftwareBufferPlayback();
        s.consecutiveSkipCount = 0;
        logAudioPlaybackEvent('info', `Web Audio Software Engine playing "${track.title || track.filename}" at ${decodedBuffer.sampleRate}Hz, ${decodedBuffer.numberOfChannels}ch, ${decodedBuffer.duration.toFixed(1)}s.`);
    } catch (err) {
        if (err && err.name === 'AbortError') return;
        if (decodeGen !== currentTrackGeneration) return;
        abortActiveSoftwareFetch();
        if (err instanceof DecodeBudgetError && !s.isStandalonePlayback && !s.userExplicitlyPaused
            && nativeAttemptGeneration !== decodeGen && canUseAndroidDecoder(track)) {
            const offset = Number.isFinite(s.pendingSoftwareSeekSec) ? s.pendingSoftwareSeekSec : startTime;
            nativeAttemptGeneration = decodeGen;
            if (androidNative.start(track, offset, nativeGain(), null)) {
                s.isSoftwareDecoding = false;
                s.pendingSoftwareSeekSec = null;
                nativeRecoveryToken = androidNative.token;
                rememberNativeQueue(androidNative.token);
                nativeEndedToken = '';
                nativeLastGain = nativeGain();
                startNativePoll();
                updateSignalPathUi(track);
                return;
            }
        }
        console.error('[AudioEngine] Software decoder fallback failed:', err);
        logAudioPlaybackEvent('error', `Web Audio software decode failure: ${err.message}`);
        s.isSoftwareDecoding = false;
        s.activeDecodedBuffer = null;
        s.userExplicitlyPaused=true;syncPlayPauseUI(false);
        showCachyToast('Playback unavailable', err.message || 'Unsupported or unreadable audio.', 'error');
    }
}

function attachAudioListeners(targetAudio) {
    const s = store.state;
    if (!targetAudio || targetAudio._hasCachyListeners) return;
    targetAudio._hasCachyListeners = true;
    let isAudioBuffering = false;

    targetAudio.addEventListener('play', () => {
        if (androidNative?.active || targetAudio._isDisposed || targetAudio !== s.audio) return;
        if (s.userExplicitlyPaused) {
            targetAudio.pause();
            syncPlayPauseUI(false);
            return;
        }
        isAudioBuffering = false;
        syncPlayPauseUI(true);
    });
    targetAudio.addEventListener('playing', () => {
        if (androidNative?.active || targetAudio._isDisposed || targetAudio !== s.audio) return;
        clearSeekStallTimer();
        if (s.userExplicitlyPaused) {
            targetAudio.pause();
            syncPlayPauseUI(false);
            return;
        }
        isAudioBuffering = false;
        syncPlayPauseUI(true);
    });
    targetAudio.addEventListener('pause', () => {
        if (androidNative?.active || targetAudio._isDisposed || targetAudio !== s.audio) return;
        if (isAudioBuffering && !s.userExplicitlyPaused) return;
        syncPlayPauseUI(false);
        if (s.isStandalonePlayback) return;
        try {
            const cur = targetAudio.currentTime;
            const dur = targetAudio.duration;
            if (cur > 0 && (!dur || isNaN(dur) || cur < (dur - 1))) {
                safeStorage.setItem('cachymusic_last_track_time', cur.toFixed(2));
            }
        } catch (_) {}
    });
    targetAudio.addEventListener('emptied', () => {
        if (androidNative?.active || targetAudio._isDisposed || targetAudio !== s.audio) return;
        syncPlayPauseUI(false);
    });
    targetAudio.addEventListener('waiting', () => {
        if (androidNative?.active || targetAudio._isDisposed || targetAudio !== s.audio) return;
        if (!s.userExplicitlyPaused) isAudioBuffering = true;
    });
    targetAudio.addEventListener('seeking', () => {
        if (androidNative?.active || targetAudio._isDisposed || targetAudio !== s.audio) return;
        if (!s.userExplicitlyPaused) isAudioBuffering = true;
    });
    targetAudio.addEventListener('stalled', () => {
        if (androidNative?.active || targetAudio._isDisposed || targetAudio !== s.audio) return;
        if (!s.userExplicitlyPaused) isAudioBuffering = true;
    });
    targetAudio.addEventListener('error', () => {
        if (androidNative?.active || targetAudio._isDisposed || targetAudio !== s.audio || s.isSoftwareDecoding) return;
        if (!targetAudio.src || targetAudio.src === window.location.href || !targetAudio.getAttribute('src')) {
            return;
        }
        const err = targetAudio.error;
        if (!err) return;
        console.error('Audio element error:', err);
        clearNoDataStallTimer();
        isAudioBuffering = false;
        syncPlayPauseUI(false);
        s.isPlayPending = false;

        if (playPendingTimeout) {
            clearTimeout(playPendingTimeout);
            playPendingTimeout = null;
        }

        const currentTrack = (s.isStandalonePlayback && s.standaloneTrackList.length > 0)
            ? s.standaloneTrackList[s.standaloneTrackIndex]
            : s.allTracks[s.currentTrackIndex];
        const trackTitle = currentTrack ? (currentTrack.title || currentTrack.filename || 'Current track') : 'Audio track';
        const errorCode = err ? err.code : 0;
        const isFatalDecodeError = (errorCode === 3 || errorCode === 4);

        const currentAttrSrc = targetAudio.getAttribute('src') || targetAudio.src || '';
        if (isFatalDecodeError && currentTrack && !s.isSoftwareDecoding) {
            rememberSoftwareDecoder(currentAttrSrc);
            if(s.userExplicitlyPaused)return;
            rememberSoftwareDecoder(targetAudio.src);
            try {
                targetAudio.pause();
                targetAudio.removeAttribute('src');
                targetAudio.load();
            } catch (_) {}
            logAudioPlaybackEvent('info', `Native decoder unsuited for "${trackTitle}" (code ${errorCode}). Playing via 32-bit Web Audio Software Engine.`);
            playWithSoftwareDecoder(currentTrack, targetAudio.currentTime || 0);
            return;
        }

        if (isFatalDecodeError || s.trackPlaybackRetryCount >= 1) {
            s.userExplicitlyPaused = true;
            s.consecutiveSkipCount++;
            const errorDesc = errorCode === 3
                ? 'Corrupted audio stream or decoder failure'
                : (errorCode === 4 ? 'Format or file source not supported' : 'Playback stream timed out');

            logAudioPlaybackEvent('error', `Track "${trackTitle}" decode failure (code ${errorCode}): ${errorDesc}`, {
                src: targetAudio.src,
                track: currentTrack
            });

            if (s.consecutiveSkipCount >= 3) {
                pauseAudio();
                logAudioPlaybackEvent('warn', 'Consecutive skip limit reached (3 tracks failed). Halting auto-skip.');
                showCachyToast('Playback Halted', 'Multiple tracks failed to decode. Check Audio Diagnostics in Settings.', 'error');
                return;
            }

            showCachyToast('Playback Error', `"${trackTitle}": ${errorDesc}. Skipping track...`, 'warning');
            store.emit('audio:reset-element');

            const errorGeneration=currentTrackGeneration;
            const recoveryAudio = s.audio;
            setTimeout(() => {
                if(errorGeneration!==currentTrackGeneration || s.audio!==recoveryAudio)return;
                const pool = s.displayedTracks.length > 0 ? s.displayedTracks : s.allTracks;
                const currentIdxInPool = findTrackIndex(pool, s.allTracks[s.currentTrackIndex]);
                if (currentIdxInPool === pool.length - 1 && s.repeatMode === 'off') {
                    pauseAudio();
                    try { recoveryAudio.currentTime = 0; } catch (_) {}
                    if (progressBar) progressBar.style.width = '0%';
                    if (currentTimeEl) currentTimeEl.textContent = '0:00';
                    try { safeStorage.removeItem('cachymusic_last_track_time'); } catch (_) {}
                } else {
                    nextTrack();
                }
            }, 1200);
            return;
        }

        if (errorCode === 2 && targetAudio.src && !s.userExplicitlyPaused && s.trackPlaybackRetryCount === 0) {
            s.trackPlaybackRetryCount++;
            const savedTime = targetAudio.currentTime || 0;
            const currentSrc = targetAudio.src, retryGeneration=currentTrackGeneration;
            setTimeout(() => {
                if (retryGeneration===currentTrackGeneration && s.audio===targetAudio && !s.userExplicitlyPaused) {
                    targetAudio.src = currentSrc;
                    targetAudio.load();
                    if (savedTime > 0) {
                        try { targetAudio.currentTime = savedTime; } catch (_) {}
                    }
                    targetAudio.play().catch(() => {
                        if(retryGeneration!==currentTrackGeneration||s.audio!==targetAudio)return;
                        syncPlayPauseUI(false);
                        s.userExplicitlyPaused = true;
                        showCachyToast('Network Error', `Could not recover stream for "${trackTitle}".`, 'error');
                    });
                }
            }, 1500);
        }
    });

    let lastPersistedTime = 0;
    targetAudio.addEventListener('timeupdate', () => {
        if (androidNative?.active || targetAudio._isDisposed || targetAudio !== s.audio) return;
        if (s.isSoftwareDecoding || s.isDraggingScrubber) return;
        const cur = targetAudio.currentTime;
        let dur = targetAudio.duration;
        const currentTrack = (s.isStandalonePlayback && s.standaloneTrackList.length > 0)
            ? s.standaloneTrackList[s.standaloneTrackIndex]
            : s.allTracks[s.currentTrackIndex];
        if (!isFinite(dur) || isNaN(dur) || dur <= 0) {
            if (currentTrack && currentTrack.duration && isFinite(currentTrack.duration)) {
                dur = Number(currentTrack.duration);
            }
        }
        updatePlaybackProgress(cur, dur);
        mediaSessionController.updatePositionState(false);

        if (!s.isStandalonePlayback && cur > 0 && Math.abs(cur - lastPersistedTime) >= 1.0) {
            lastPersistedTime = cur;
            if (!dur || isNaN(dur) || cur < (dur - 1)) {
                try { safeStorage.setItem('cachymusic_last_track_time', cur.toFixed(2)); } catch (_) {}
            }
        }
        checkAndPreloadNextTrack(cur, dur);
        mprisSyncHook(false);
    });

    targetAudio.addEventListener('ended', () => {
        if (androidNative?.active || targetAudio._isDisposed || targetAudio !== s.audio) return;
        if (typeof targetAudio._trackGeneration === 'number' && targetAudio._trackGeneration !== currentTrackGeneration) {
            return;
        }
        if (!s.isStandalonePlayback) { try { safeStorage.removeItem('cachymusic_last_track_time'); } catch (_) {} }

        const curTime = targetAudio.currentTime || 0;
        const currentTrack = (s.isStandalonePlayback && s.standaloneTrackList.length > 0)
            ? s.standaloneTrackList[s.standaloneTrackIndex]
            : s.allTracks[s.currentTrackIndex];
        const trackDur = targetAudio.duration || (currentTrack ? (currentTrack.duration || 0) : 0);
        const trackTitle = currentTrack ? (currentTrack.title || currentTrack.filename || 'Current track') : 'Audio track';

        if ((trackDur > 5 && curTime < 3.0) || curTime === 0) {
            logAudioPlaybackEvent('warn', `Premature stream termination at ${curTime.toFixed(2)}s on "${trackTitle}"`);
            appendDebugTelemetry(`[WARN] Premature stream end at ${curTime.toFixed(2)}s / ${trackDur.toFixed(2)}s for "${trackTitle}". Attempting reload...`, 'warn');
            if (s.trackPlaybackRetryCount < 2) {
                s.trackPlaybackRetryCount++;
                const retryGeneration=currentTrackGeneration;
                setTimeout(() => {
                    if (retryGeneration===currentTrackGeneration && s.audio===targetAudio && !s.userExplicitlyPaused) {
                        try { targetAudio.load(); } catch (_) {}
                        playAudio();
                    }
                }, 400);
                return;
            }
            pauseAudio();
            showToast(`Playback paused on "${trackTitle}". Stream buffer interrupted.`);
            return;
        }
        appendDebugTelemetry(`[EVENT] Track finished naturally at ${curTime.toFixed(1)}s`);

        if (s.sleepTimerMode === 'end') {
            pauseAudio();
            cancelSleepTimer(false);
            showToast('Sleep timer: End of track reached. Playback paused.');
            return;
        }

        if (s.repeatMode === 'one') {
            targetAudio.currentTime = 0;
            playAudio();
        } else {
            nextTrack(false);
        }
    });

    targetAudio.addEventListener('loadedmetadata', () => {
        if (androidNative?.active || targetAudio._isDisposed || targetAudio !== s.audio) return;
        if (targetAudio.duration && !isNaN(targetAudio.duration)) {
            if (totalDurationEl) totalDurationEl.textContent = formatTime(targetAudio.duration);
            if (miniTotalDuration) miniTotalDuration.textContent = formatTime(targetAudio.duration);
            mediaSessionController.updatePositionState(true);
        }
        try {
            if (s.currentPlaybackSpeed !== 1.0) {
                targetAudio.playbackRate = s.currentPlaybackSpeed;
            }
            targetAudio.preservesPitch = s.isPitchLockTempo;
            targetAudio.mozPreservesPitch = s.isPitchLockTempo;
            targetAudio.webkitPreservesPitch = s.isPitchLockTempo;
        } catch (_) {}
    });

    targetAudio.addEventListener('seeked', () => {
        if (androidNative?.active || targetAudio._isDisposed || targetAudio !== s.audio) return;
        clearSeekStallTimer();
        isAudioBuffering = false;
        if (!s.userExplicitlyPaused && targetAudio.paused && !s.isSoftwareDecoding) {
            s.isPlayPending = false;
            playAudio(true);
        }
        mediaSessionController.updatePositionState(true);
        mprisSyncHook(true);
    });
}

// --- Core Track Status & Session Methods ---
function updateSignalPathUi(track = store.state.isStandalonePlayback
    ? store.state.standaloneTrackList[store.state.standaloneTrackIndex]
    : store.state.allTracks[store.state.currentTrackIndex]) {
    return renderSignalPath(store.state, track, Boolean(androidNative?.active), getConfirmedAudioRoute(), hasActiveDsp());
}

function findTrackIndexBySavedState(pool) {
    return findSavedTrackIndex(pool || [], safeStorage);
}

async function restoreSessionState() {
    const s = store.state;
    const urlParams = new URLSearchParams(window.location.search);
    const reqTrack = urlParams.get('track');

    if (urlParams.get('tab') === 'playlists' || window.location.hash === '#playlists') {
        if (tabPlaylists) tabPlaylists.click();
    }

    const savedPlid = safeStorage.getItem('cachymusic_last_playlist_id');
    const savedPlName = safeStorage.getItem('cachymusic_last_playlist_name');
    if (savedPlid) {
        const matchedPl = s.playlists.find(p => p.plid == savedPlid);
        if (matchedPl && typeof s.openPlaylist === 'function') {
            await s.openPlaylist(matchedPl.plid, matchedPl.name || savedPlName);
        } else {
            try {
                safeStorage.removeItem('cachymusic_last_playlist_id');
                safeStorage.removeItem('cachymusic_last_playlist_name');
            } catch (_) {}
        }
    }

    if (s.allTracks.length === 0) return;

    let targetIdx = 0;
    if (reqTrack !== null && !isNaN(parseInt(reqTrack, 10)) && s.allTracks[parseInt(reqTrack, 10)]) {
        targetIdx = parseInt(reqTrack, 10);
    } else {
        const pool = (s.currentPlaylistId !== null && s.displayedTracks.length > 0) ? s.displayedTracks : s.allTracks;
        const foundPoolIdx = findTrackIndexBySavedState(pool);
        if (foundPoolIdx !== -1) {
            const tr = pool[foundPoolIdx];
            const masterIdx = findTrackIndex(s.allTracks, tr);
            targetIdx = masterIdx !== -1 ? masterIdx : 0;
        } else {
            const foundGlobalIdx = findTrackIndexBySavedState(s.allTracks);
            if (foundGlobalIdx !== -1) {
                targetIdx = foundGlobalIdx;
            } else if (s.currentPlaylistId !== null && s.displayedTracks.length > 0) {
                const firstPlTrack = s.displayedTracks[0];
                const masterIdx = findTrackIndex(s.allTracks, firstPlTrack);
                targetIdx = masterIdx !== -1 ? masterIdx : 0;
            }
        }
    }

    let savedTime = 0;
    try {
        const rawTime = safeStorage.getItem('cachymusic_last_track_time');
        if (findTrackIndexBySavedState(s.allTracks) === targetIdx && rawTime !== null && Number.isFinite(parseFloat(rawTime))) {
            const parsed = parseFloat(rawTime);
            const targetTrack = s.allTracks[targetIdx];
            const trackDur = (targetTrack && targetTrack.duration) ? Number(targetTrack.duration) : 0;
            if (parsed > 0 && (!trackDur || parsed < (trackDur - 1))) {
                savedTime = parsed;
            }
        }
    } catch (_) {}

    const existing=androidNative?.snapshot();
    if (androidNative?.supportsQueue && !androidNative.active) {
        if (existing?.token && !s.playQueue.length) {
            s.playQueue = restoreNativeQueue(safeStorage.getItem(NATIVE_QUEUE_STORAGE), existing.token, s.allTracks);
            if (s.playQueue.length) store.emit('library:update-queue', { fromNative: true });
        }
        reconcileNativeQueue(existing);
        if (!existing?.token || existing.state === 'stopped') safeStorage.removeItem(NATIVE_QUEUE_STORAGE);
    }
    if(existing?.token&&existing.state!=='stopped'){
        const idx=s.allTracks.findIndex(t=>indexedSource(t)===existing.uri);
        if (idx >= 0 && nativeEligible(s.allTracks[idx])) {
            if (androidNative.supportsShuffle && typeof existing.shuffle === 'boolean') {
                s.isShuffle = existing.shuffle;
                updateShuffleButton();
            }
            await loadTrack(idx, false, Number(existing.position || 0) / 1000, existing);
            return;
        }
        if(!await stopNative())return;
    }
    if (s.allTracks[targetIdx]) {
        await loadTrack(targetIdx, false, savedTime);
        if (s.isLyricsView) {
            updateLyricsDisplay(s.allTracks[targetIdx]);
        }
    }
}

function updateDacStatusUi() {
    const s = store.state;
    updateSignalPathUi(s.isStandalonePlayback ? s.standaloneTrackList[s.standaloneTrackIndex] : s.allTracks[s.currentTrackIndex]);
}

function updateTrackBadgeUi(track) {
    if (!trackBadge || !track) return;
    const badgeParts = [];
    const fmt = resolveTrackFormat(track);
    if (fmt) badgeParts.push(fmt);
    const bd = track.bitDepth || null;
    if (bd) badgeParts.push(`${bd}-Bit`);
    if (track.sampleRate) {
        badgeParts.push(track.sampleRate >= 1000 ? `${(track.sampleRate / 1000).toFixed(1)} kHz` : `${track.sampleRate} Hz`);
    }
    if (track.bitrate) badgeParts.push(`${track.bitrate} kbps`);
    if (track.channels === 2) badgeParts.push('Stereo');
    else if (track.channels === 1) badgeParts.push('Mono');
    else if (track.channels) badgeParts.push(`${track.channels} ch`);
    trackBadge.textContent = badgeParts.length > 0 ? badgeParts.join(' • ') : 'AUDIO';
}

function updateVolumeIcon(vol) {
    const audio = store.state.audio;
    let pathHtml = '';
    if (vol === 0 || (audio && audio.muted)) {
        pathHtml = '<path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>';
    } else if (vol < 0.5) {
        pathHtml = '<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>';
    } else {
        pathHtml = '<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>';
    }

    if (volumeIcon) volumeIcon.innerHTML = pathHtml;
    const miniVolIcon = document.getElementById('miniVolumeIcon');
    if (miniVolIcon) miniVolIcon.innerHTML = pathHtml;
}

function updateMediaSessionPositionState(force = false) {
    mediaSessionController.updatePositionState(force);
}

function setupMediaSessionActionHandlers() {
    mediaSessionController.init({
        play: () => playAudio(true),
        pause: () => pauseAudio(),
        prev: () => prevTrack(),
        next: () => nextTrack(),
        seekTo: (sec) => seekAudio(sec),
        getDuration: () => {
            const s = store.state;
            if(androidNative?.active)return nativeDuration();
            if (s.isSoftwareDecoding && s.activeDecodedBuffer) return s.activeDecodedBuffer.duration;
            if (s.audio && s.audio.duration && isFinite(s.audio.duration)) return s.audio.duration;
            const tr = (s.isStandalonePlayback && s.standaloneTrackList.length > 0)
                ? s.standaloneTrackList[s.standaloneTrackIndex]
                : s.allTracks[s.currentTrackIndex];
            return (tr && tr.duration) ? Number(tr.duration) : 0;
        },
        getPosition: () => {
            const s = store.state;
            if(androidNative?.active)return nativePosition();
            if (s.isSoftwareDecoding) {
                return softwarePosition();
            }
            return s.audio ? (s.audio.currentTime || 0) : 0;
        },
        getPlaybackRate: () => store.state.isSoftwareDecoding ? 1.0 : (store.state.currentPlaybackSpeed || 1.0)
    });
}

const nativeModeControl=document.getElementById('androidNativeMode');
if(nativeModeControl){const row=nativeModeControl.closest('.settingsRowItem');row.hidden=!androidNative;if(!androidNative)row.style.display='none';nativeModeControl.checked=safeStorage.getItem('cachymusic_android_native')==='true';nativeModeControl.addEventListener('change',()=>{safeStorage.setItem('cachymusic_android_native',String(nativeModeControl.checked));});}
const continuousPcmControl=document.getElementById('continuousPcmMode');
if(continuousPcmControl){continuousPcmControl.checked=safeStorage.getItem('cachymusic_continuous_pcm')==='true';continuousPcmControl.addEventListener('change',()=>{safeStorage.setItem('cachymusic_continuous_pcm',String(continuousPcmControl.checked));if(!continuousPcmControl.checked)cancelPcmSuccessor();});}

store.subscribe('playback:seek', (e) => {
    const d = e?.detail;
    if (!d || typeof d.time !== 'number') return;
    seekAudio(d.time);
    if (d.play) playAudio(true);
});
store.subscribe('playback:pause', () => pauseAudio());
store.subscribe('playback:order-change', () => refreshNativeOrder());
store.subscribe('playback:sleep-mode-change', () => {
    if (store.state.sleepTimerMode === 'end') cancelPcmSuccessor();
    refreshNativeOrder();
});
store.subscribe('library:update-queue', event => {
    if (event.detail?.fromNative) return;
    nativeQueueEdits++;
    refreshNativeOrder();
});
store.subscribe('ui:sync-signal-path', () => updateSignalPathUi());
store.subscribe('ui:sync-dac-status', () => updateDacStatusUi());
store.subscribe('ui:sync-track-badge', (e) => updateTrackBadgeUi(e?.detail?.track));
store.subscribe('ui:sync-volume-icon', (e) => updateVolumeIcon(e?.detail?.volume ?? store.state.currentVolumeValue));
store.subscribe('audio:graph-lost', () => {
    const s = store.state;
    // Native playback is independent of the Web Audio context.
    if (androidNative?.active || (!s.isPlaying && !s.isPlayPending && !s.isSoftwareDecoding)) return;
    ++currentPlayRequestId;
    ++trackLoadToken;
    ++currentTrackGeneration;
    if (s.audio) s.audio._trackGeneration = currentTrackGeneration;
    s.isPlayPending = false;
    s.userExplicitlyPaused = true;
    if (playPendingTimeout) { clearTimeout(playPendingTimeout); playPendingTimeout = null; }
    clearNoDataStallTimer();
    clearSeekStallTimer();
    stopSoftwarePlayback();
    s.activeDecodedBuffer = null;
    try { s.audio?.pause(); } catch (_) {}
    syncPlayPauseUI(false, true);
    showToast('Audio output closed. Press Play to restart playback.');
});
store.subscribe('audio:attach-listeners', (e) => attachAudioListeners(e?.detail?.audio || store.state.audio));

export {
    activeLoadedMetadataHandler,
    nativePosition, nativeDuration,
    attachAudioListeners,
    cancelSoftwareProgressLoop,
    checkAndPreloadNextTrack,
    currentPlayRequestId,
    currentTrackGeneration,
    executeGaplessHandoff,
    exitStandalonePlayback,
    findTrackIndexBySavedState,
    getValidSampleRate,
    initMprisBridge,
    lastPositionStateUpdate,
    loadStandaloneTrack,
    loadTrack,
    nextTrack,
    onSoftwarePlaybackEnded,
    pauseAudio,
    pauseSoftwarePlayback,
    peekNextTrackIndex,
    playAudio,
    playPendingTimeout,
    playWithSoftwareDecoder,
    prevTrack,
    recomputeMarquees,
    resolveTrackFormat,
    restoreSessionState,
    resumeSoftwarePlayback,
    seekAudio,
    seekSoftwarePlayback,
    setupMediaSessionActionHandlers,
    softwarePosition,
    startSoftwareBufferPlayback,
    startSoftwareProgressLoop,
    stopSoftwarePlayback,
    syncPlayPauseUI,
    togglePlayPause,
    updateDacStatusUi,
    updateMarqueeText,
    updateMediaSessionPositionState,
    updatePlaybackProgress,
    updateRepeatUI,
    updateSignalPathUi,
    updateTrackBadgeUi,
    updateVolumeIcon
};
