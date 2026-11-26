import {serverLibraryGate} from './library-transition.js';
import {startMediaWithDeadline} from './audio-context-policy.js';
import {appAttenuation} from './audio-policies.js';
import {interruptListening,finishListeningVisit,observeListening,hasNativeListening,markNativeListening,syncNativeHistory} from './listening-history.js';
import {saveNativePlaylist,restoreNativePlaylist} from './android-native-playback.js';
import {playbackPool, playlistNeighbor, recordPlaylistVisit, historyNeighbor, seekPlaylistHistory, syncPlaylistShuffle} from './playlist-playback.js';
import {createMediaElementListener} from './media-element-events.js';
import {updatePlaybackProgress} from './player-progress.js';
import {createBoundedDecoder,validateDecodedAudioBuffer} from './software-audio-decoder.js';
import {createAudioEditGuard, confirmAudioChange} from './audio-change-policy.js';
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
import { openAndroidDirectPcm, closeAndroidDirectPcm } from './android-pcm-reader.js';
import { PcmRangeSource } from './pcm-range.js';
import { inspectPcm } from './pcm-reader.js';
import { PcmStream } from './pcm-stream.js';
import { nextPcmCandidate, sameCandidate, canScheduleSuccessor } from './pcm-transition.js';
import { resolveTrackSource, resolveLocalFile, releaseInactiveSources } from './local-source.js';
import { DecodeBudgetError, MAX_COMPRESSED_BYTES, MAX_PCM_BYTES, validateDecodeBudget, fetchBoundedAudio } from './decode-budget.js';
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
import { outputHold, acknowledgeAudioEdit, getConfirmedAudioRoute, audioBufferChangePending, ensureAudioEngineForSampleRate, getOrCreateAudioSourceNode, resumeAudioGraph, requirePlaybackGraph, setVolume, updateAudioRouting } from './audio-engine.js';
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
const NATIVE_PLAYLIST_STORAGE = 'cachymusic_android_playlist_session';
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
function nativeGain(){const s=store.state;return s.audio?.muted?0:appAttenuation(s);}
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
    safeStorage.setItem(NATIVE_PLAYLIST_STORAGE,saveNativePlaylist(token,store.state.playlistPlayback));
    if (androidNative.supportsQueue) safeStorage.setItem(NATIVE_QUEUE_STORAGE, saveNativeQueue(token, store.state.playQueue));
}
function nativeOrderKey(status) {
    const s = store.state;
    return [status.token, status.revision, s.allTracks[s.currentTrackIndex], s.allTracks, s.allTracks.length,
        playbackPool(s), playbackPool(s).length,s.playlistPlayback?.cursor,s.playlistPlayback?.historyIndex, s.playQueue, s.playQueue.length, nativeQueueEdits, s.isShuffle, s.repeatMode, s.sleepTimerMode === 'end'];
}
function refreshNativeOrder(status = androidNative?.read()) {
    if (!androidNative?.supportsOrder || nativeReleasing || !status || status.state === 'stopped') return;
    if (status.token === nativeRecoveryToken) return;
    if(!syncNativeTrack(status))return;
    reconcileNativeQueue(status);
    const s = store.state;
    if (nativeOrderKey(status).every((value, i) => value === nativeOrderInputs[i])) return;
    if (androidNative.supportsQueue) {
        s.playQueue = identifyQueueEntries(s.playQueue);
        rememberNativeQueue(status.token);
    }
    if(!androidNative.supportsQueue)rememberNativeQueue(status.token);
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
    shuffleBtn.setAttribute('aria-pressed', String(isShuffle));
    shuffleBtn.setAttribute('title', isShuffle ? 'Shuffle Active' : 'Toggle Shuffle');
}

function syncNativeTrack(status) {
    const s = store.state;
    if (!status?.uri || status.uri === indexedSource(s.allTracks[s.currentTrackIndex])) return true;
    const index = s.allTracks.findIndex(track => indexedSource(track) === status.uri);
    if (index >= 0) {const consumed=new Set(status.consumedQueueIds||[]);const queued=s.playQueue.some(t=>consumed.has(t.nativeQueueId)&&indexedSource(t)===status.uri);loadTrack(index, false, status.position / 1000, status,false,queued);}
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
                safeStorage.removeItem(NATIVE_PLAYLIST_STORAGE);
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
    let savedPositionKey = '', listeningNativeVisit='';
    const tick=()=>{
        if(nativeReleasing||!androidNative?.active)return;
        const v=androidNative.read(),s=store.state;if(!v)return;
        if(v.state==='stopped'){
            reconcileNativeQueue(v);
            if (androidNative.supportsQueue) safeStorage.removeItem(NATIVE_QUEUE_STORAGE);
                safeStorage.removeItem(NATIVE_PLAYLIST_STORAGE);
            androidNative.token='';androidNative.last=null;clearInterval(nativePoll);nativePoll=null;nativeOrderInputs=[];
            syncPlayPauseUI(false,true);updateSignalPathUi(s.allTracks[s.currentTrackIndex]);return;
        }
        if (!syncNativeTrack(v)) return;
        reconcileNativeQueue(v);
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
        const nativeVisit=`${v.token}:${v.revision??0}`;
        if(listeningNativeVisit&&listeningNativeVisit!==nativeVisit)finishListeningVisit();
        listeningNativeVisit=nativeVisit;
        if(hasNativeListening()){markNativeListening(track);void syncNativeHistory();}
        else observeListening(track,position,duration,v.state==='playing',1);
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
            finishListeningVisit();
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
        setVolume, orderChanged: () => store.emit('playback:order-change'), updateRepeatUI
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
let noDataStallTimer = null;
let removeNoDataListener = null;
let seekStallTimer = null;
let lastPositionStateUpdate = 0;
let activeDecodeAbortController = null;
const softwareBufferCache = new Map();
const compatibilityDecode = createBoundedDecoder();
let trackLoadToken = 0;
let pcmStream = null;
let pcmStartEpoch = 0;
let pcmFile = null;
let pendingPcm = null;
function continuousPcmEnabled(){return store.state.sleepTimerMode!=='end' && safeStorage.getItem('cachymusic_continuous_pcm')==='true' && (store.state.currentPlaybackSpeed||1)===1;}
function pcmExtension(track,file){return /\.(wav|wave|aif|aiff|flac)$/i.test(track?.filename||file?.name||'');}
function canAndroidDirectDecode(track) {
    return Boolean(
        androidNative
        && safeStorage.getItem('cachymusic_experimental_android_pcm') === 'true'
        && indexedSource(track)
        && typeof window !== 'undefined'
        && typeof window.AndroidBridge?.supportsDirectPcm === 'function'
        && window.AndroidBridge.supportsDirectPcm()
    );
}
function canStreamPcmTrack(track, file) {
    return pcmExtension(track, file) || canAndroidDirectDecode(track);
}
function shouldUseDirectEngine(track) {
    const s = store.state;
    if (!androidNative || !indexedSource(track) || nativeEligible(track)) return false;
    if ((s.currentPlaybackSpeed || 1) !== 1 || typeof Worker !== 'function') return false;
    return canAndroidDirectDecode(track) || (/\.flac$/i.test(track.filename || '') && hasActiveDsp());
}
function presentSecondaryTrackMeta(track, isStandalone = false) {
    if (!track) return;
    applyTrackMetadataToDom(track, isStandalone);
    updateSignalPathUi(track);
    mediaSessionController.updateMetadata(track);
    mprisSyncHook(true);
}
function presentTrackOnDeck(track, { isStandalone = false, artistFallback = 'Unknown', albumText = null, syncLyrics = true, targetTime = 0, deferSecondary = false } = {}) {
    if (!track) return;
    if (trackName) updateMarqueeText(trackName, track.title || track.filename || (isStandalone ? 'Standalone Audio' : 'Unknown'));
    if (artistName) updateMarqueeText(artistName, track.artist || artistFallback);
    if (albumName) updateMarqueeText(albumName, albumText ?? (track.album ? `Album: ${track.album}${track.year ? ' (' + track.year + ')' : ''}` : 'Album: Unknown'));
    updateTrackBadgeUi(track);
    const coverSrc = track.cover || 'resources/images/default.svg';
    applyArtworkToDeck(coverSrc, Boolean(track.cover && !track.cover.includes('default.svg')));
    updateMiniPlayerInfo(track);
    if (syncLyrics) {
        updateLyricsDisplay(track);
        if (targetTime > 0) updateActiveLyric(targetTime);
    }
    if (!deferSecondary) presentSecondaryTrackMeta(track, isStandalone);
}
function releaseDirectFormat(format) {
    if (format?.codec !== 'android-direct' || format.sessionClosed) return;
    format.sessionClosed = true;
    void closeAndroidDirectPcm(format.sessionId);
}
function cancelPcmSuccessor(){const old=pendingPcm;pendingPcm=null;releaseDirectFormat(old?.format);old?.stream?.stop();}
function stopPcmStream(){++pcmStartEpoch;cancelPcmSuccessor();const old=pcmStream;pcmStream=null;releaseDirectFormat(old?.format);old?.stop();}
function softwarePosition(){const s=store.state;return pcmStream?.started?pcmStream.position():Math.max(0, s.softwarePlaybackOffset+(!s.isSoftwarePaused&&s.audioContext&&Boolean(s.softwareSourceNode)&&!s.activeDecodedBuffer?.streaming?Math.max(0,s.audioContext.currentTime-s.softwarePlaybackStartTime):0));}
async function preparePcmInput(track,localFile){
    const file=localFile===undefined?await resolveLocalFile(track):localFile;
    if (!file && canAndroidDirectDecode(track) && !/\.(wav|wave|aif|aiff)$/i.test(track?.filename || '')) {
        try {
            const directFormat = await openAndroidDirectPcm(track.src, track.duration);
            // Keep hi-res >16-bit FLAC on exact JS reader unless MediaCodec delivers float PCM.
            if (/\.flac$/i.test(track?.filename || '') && Number(track?.bitDepth) > 16 && !directFormat.isFloat) {
                void closeAndroidDirectPcm(directFormat.sessionId);
            } else {
                return { file: null, format: directFormat };
            }
        } catch (err) {
            if (!pcmExtension(track, file)) return null;
        }
    }
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
        onProgress:()=>{
            if(pcmStream===stream)checkPcmSuccessor(stream);
            else if(pendingPcm?.stream===stream){
                // The successor's clock can advance while the previous stream's
                // timer is throttled. Settle the previous boundary before this
                // stream processes its own completion/underrun.
                const previous=pendingPcm.current;
                if(pcmStream===previous&&previous.started&&previous.ctx.currentTime>=previous.endTime)void previous.pump();
            }
        },
        onEnd:()=>{releaseDirectFormat(stream.format);if(pcmStream!==stream){if(pendingPcm?.stream===stream)cancelPcmSuccessor();return;}if(adoptPcmSuccessor())return;pcmStream=null;onSoftwarePlaybackEnded();},
        onError:(error,position)=>{
            releaseDirectFormat(stream.format);
            if(pcmStream!==stream){
                if(pendingPcm?.stream===stream){
                    // A worker can fail after its scheduled audible boundary but
                    // before the old stream's delayed terminal callback runs.
                    if(adoptPcmSuccessor({stream,error,position}))return;
                    cancelPcmSuccessor();
                }
                return;
            }
            cancelPcmSuccessor();pcmStream=null;s.softwarePlaybackOffset=Math.max(s.softwarePlaybackOffset,position);s.softwarePlaybackStartTime=0;s.isSoftwarePaused=true;s.userExplicitlyPaused=true;cancelSoftwareProgressLoop();syncPlayPauseUI(false);showCachyToast('PCM playback interrupted',error.message,'error');
        }
    });
    return stream;
}
function eligiblePcmCandidate(){
    const s=store.state;
    return continuousPcmEnabled()&&!audioBufferChangePending()&&!hasActiveDsp()&&s.mathPrecision==='native'&&!s.userExplicitlyPaused&&!s.audioEditPaused&&!s.isSoftwarePaused?nextPcmCandidate(s):null;
}
function invalidatePcmSuccessor(){
    if(pendingPcm&&(pendingPcm.current!==pcmStream||!sameCandidate(pendingPcm.candidate,eligiblePcmCandidate())))cancelPcmSuccessor();
}
function checkPcmSuccessor(current){
    if(pcmStream!==current||!current.started||current.closed)return;
    if(!pendingPcm&&current.endTime-current.ctx.currentTime>5)return;
    invalidatePcmSuccessor();
    const candidate=eligiblePcmCandidate();
    if(!candidate||!canStreamPcmTrack(candidate.track)||current.endTime-current.ctx.currentTime>5)return;
    if(!pendingPcm&&!sameCandidate(current.lastAttempt,candidate)){
        current.lastAttempt=candidate;
        const job={candidate,current,stream:null};pendingPcm=job;
        (async()=>{
            const result=await preparePcmInput(candidate.track);
            if(pendingPcm!==job||pcmStream!==current){releaseDirectFormat(result?.format);return;}
            if(!result){cancelPcmSuccessor();return;}
            if(!sameCandidate(candidate,eligiblePcmCandidate())){releaseDirectFormat(result.format);cancelPcmSuccessor();return;}
            job.file=result.file;job.format=result.format;job.stream=makePcmStream(job.file,job.format);
            await job.stream.prepare(0);
            if(pendingPcm!==job||pcmStream!==current){job.stream.stop();return;}
            checkPcmSuccessor(current);
        })().catch(()=>{if(pendingPcm===job)cancelPcmSuccessor();});
    }
    if(pendingPcm?.stream&&canScheduleSuccessor(current,pendingPcm.stream)){
        const job=pendingPcm;
        try{job.stream.startPrepared(current.endTime,{notify:false});job.scheduled=job.stream.started;}catch(_){cancelPcmSuccessor();}
    }
}
function adoptPcmSuccessor(failure=null){
    const s=store.state,job=pendingPcm;
    const afterFailedBoundary=Boolean(failure&&job?.scheduled&&job.stream===failure.stream&&job.current===pcmStream&&job.current.started&&job.current.ctx.currentTime>=job.current.endTime&&Number.isFinite(failure.position));
    if(!job||job.current!==pcmStream||!(afterFailedBoundary||(!failure&&job.stream?.started&&!job.stream.closed))||!sameCandidate(job.candidate,eligiblePcmCandidate())){cancelPcmSuccessor();return false;}
    pendingPcm=null;
    if(afterFailedBoundary){releaseDirectFormat(job.current.format);job.current.stop();}
    pcmStream=afterFailedBoundary?null:job.stream;pcmFile=job.file;
    const {track,index,queue}=job.candidate;
    ++trackLoadToken;++currentTrackGeneration;++currentPlayRequestId;
    if(queue)s.playQueue.shift();
    s.currentTrackIndex=index;s.currentTrack=track;if(!queue){const forward=historyNeighbor(s,1);if(forward?.index===index)seekPlaylistHistory(s,forward);}recordPlaylistVisit(s,track,Boolean(queue));s.activeDecodedBuffer=job.format;track.duration=job.format.duration;
    s.softwarePlaybackStartTime=afterFailedBoundary?0:job.stream.anchor;
    s.softwarePlaybackOffset=afterFailedBoundary?Math.max(0,Math.min(track.duration,failure.position)):0;
    s.isSoftwarePaused=afterFailedBoundary;s.trackPlaybackRetryCount=0;
    if(afterFailedBoundary)s.userExplicitlyPaused=true;
    rememberTrack(safeStorage, track);
    if(queue)store.emit('library:update-queue');
    store.emit('track:change',{track,index});
    presentTrackOnDeck(track);
    if(totalDurationEl)totalDurationEl.textContent=formatTime(track.duration);if(miniTotalDuration)miniTotalDuration.textContent=formatTime(track.duration);
    updatePlaybackProgress(afterFailedBoundary?s.softwarePlaybackOffset:job.stream.position(),track.duration);mediaSessionController.updatePositionState(true);
    store.emit('library:render-window',{preserveScroll:true});
    if(afterFailedBoundary){cancelSoftwareProgressLoop();syncPlayPauseUI(false);showCachyToast('PCM playback interrupted',failure.error.message,'error');}
    else startSoftwareProgressLoop();
    return true;
}
function startPcmPlayback(){
    const s=store.state, format=s.activeDecodedBuffer;
    stopPcmStream();
    if((!pcmFile && format?.codec !== 'android-direct') || !format?.streaming || !s.audioContext)return;
    if(!s.softwareSourceGainNode||s.softwareSourceGainNode.context!==s.audioContext)s.softwareSourceGainNode=s.audioContext.createGain();
    updateAudioRouting();
    if(!getConfirmedAudioRoute()){s.isSoftwarePaused=true;s.userExplicitlyPaused=true;syncPlayPauseUI(false);showCachyToast('Playback unavailable','PCM audio route is not connected.','error');return;}
    if (format.codec === 'android-direct' && format.sessionClosed) {
        if (!format.trackSrc) {
            s.isSoftwarePaused = true;
            syncPlayPauseUI(false);
            showCachyToast('PCM playback interrupted', 'Missing audio source for resume', 'error');
            return;
        }
        const resumeGen = currentTrackGeneration, startEpoch = pcmStartEpoch;
        s.isSoftwarePaused = false;
        void openAndroidDirectPcm(format.trackSrc, format.duration).then(fresh => {
            if (startEpoch !== pcmStartEpoch || resumeGen !== currentTrackGeneration || s.activeDecodedBuffer !== format || s.isSoftwarePaused || s.userExplicitlyPaused) {
                void closeAndroidDirectPcm(fresh.sessionId);
                return;
            }
            if (fresh.sampleRate !== format.sampleRate || fresh.channels !== format.channels || fresh.isFloat !== format.isFloat || fresh.frames !== format.frames || fresh.mime !== format.mime) {
                releaseDirectFormat(fresh);
                throw Error('Decoder format changed on resume. Reload the track.');
            }
            format.sessionId = fresh.sessionId;
            format.sessionClosed = false;
            const stream = makePcmStream(pcmFile, format);
            pcmStream = stream;
            s.softwarePlaybackStartTime = 0;
            s.isSoftwarePaused = false;
            stream.start(s.softwarePlaybackOffset, false).catch(err => stream.fail(err));
        }).catch(err => {
            if (startEpoch !== pcmStartEpoch || resumeGen !== currentTrackGeneration) return;
            s.isSoftwarePaused = true;
            s.userExplicitlyPaused = true;
            syncPlayPauseUI(false);
            showCachyToast('PCM playback interrupted', err?.message || 'Unable to reopen direct stream', 'error');
        });
        return;
    }
    const stream=makePcmStream(pcmFile,format);
    pcmStream=stream;s.softwarePlaybackStartTime=0;s.isSoftwarePaused=false;
    stream.start(s.softwarePlaybackOffset, false).catch(err=>stream.fail(err));
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
async function loadTrack(index, autoPlay = true, initialTime = 0, adoptNative = null, useMediaElement = false, fromQueue = false, playlistContext = undefined, historyTarget = null, options = {}) {
    const release=serverLibraryGate.beginTransport();
    if(!release){showToast('Library directory is changing. Wait for completion or refresh.');return;}
    try {
    store.state.audioEditPaused=false;
    const s = store.state;
    const requestedTrack=s.allTracks[index];
    if (!requestedTrack) return;
    const loadToken=++trackLoadToken, loadPlayId=++currentPlayRequestId;
    if(adoptNative){androidNative?.adopt(adoptNative);}else if(!await stopNative()||loadToken!==trackLoadToken||s.allTracks[index]!==requestedTrack)return;
    if(playlistContext!==undefined){s.playlistPlayback=playlistContext;if(playlistContext)s.isShuffle=playlistContext.shuffle;updateShuffleButton();}
    if (!autoPlay && !adoptNative) s.userExplicitlyPaused = true;
    currentTrackGeneration++;
    if(activeLoadedMetadataHandler&&s.audio)s.audio.removeEventListener('loadedmetadata',activeLoadedMetadataHandler);
    const nextCandidate = s.allTracks[index];
    const nextWillUseSpecialTransport = Boolean(adoptNative || nativeEligible(nextCandidate) || shouldPreferSoftwareDecoder(nextCandidate) || (!useMediaElement && shouldUseDirectEngine(nextCandidate)));
    if (s.audio) {
        s.audio.pause();
        if (nextWillUseSpecialTransport && s.audio.getAttribute('src')) {
            s.audio.removeAttribute("src");
            s.audio.load();
        }
    }
    if(s.secondaryAudio && s.secondaryAudio.getAttribute('src')){s.secondaryAudio.pause();s.secondaryAudio.removeAttribute("src");s.secondaryAudio.load();}
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

    if (s.isStandalonePlayback) {
        s.isStandalonePlayback = false;
        updateStandaloneBannerUi(false);
    }
    const track = s.allTracks[s.currentTrackIndex];
    s.currentTrack = track;
    if(historyTarget)seekPlaylistHistory(s,historyTarget);
    recordPlaylistVisit(s,track,fromQueue);

    if (track) rememberTrack(safeStorage, track);

    let trackSrc = adoptNative ? track.src : await resolveTrackSource(track);
    if(loadToken!==trackLoadToken)return;
    releaseInactiveSources(trackSrc);
    if(!trackSrc){syncPlayPauseUI(false);showToast('Music file unavailable. Reimport or relink it.');return;}
    if (trackSrc.startsWith('../')) trackSrc = trackSrc.substring(3);

    const prefersSoftware = shouldPreferSoftwareDecoder(track, trackSrc);
    const streamDirect = !useMediaElement && shouldUseDirectEngine(track);
    const isKnownSoftware = prefersSoftware || streamDirect;
    const targetRate = track.sampleRate ? getValidSampleRate(track.sampleRate) : 44100;
    const refreshBuffer = !nativeEligible(track) && audioBufferChangePending();
    if (!adoptNative && (refreshBuffer || !(autoPlay && (isKnownSoftware || nativeEligible(track))))) {
        await ensureAudioEngineForSampleRate(targetRate, refreshBuffer);
    }

    if (loadToken!==trackLoadToken || s.currentTrackIndex !== index) return;

    store.emit('track:change', { track, index, preserveListening: initialTime > 0 });

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
    presentTrackOnDeck(track, { syncLyrics: false, deferSecondary: true });

    if (coverBadge) {
        if (track.cover) {
            coverBadge.textContent = 'COVER ART';
            coverBadge.style.color = 'inherit';
        } else {
            coverBadge.textContent = 'MUSIC ICON';
            coverBadge.style.color = 'var(--text-muted)';
        }
    }

    store.emit('library:render-window', { preserveScroll: true, activeOnly: true });
    const displayedIdx = findTrackIndex(s.displayedTracks, track);
    if (displayedIdx !== -1 && trackList) {
        const activeEl = trackList.querySelector(`.trackItem[data-index="${displayedIdx}"]`);
        if (activeEl) {
            activeEl.classList.add('active');
            if (!options?.fromClick) {
                activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        } else if (!options?.fromClick) {
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

    let playbackPromise = null;
    if (adoptNative) {
        syncPlayPauseUI(adoptNative.state === 'playing', true);
        startNativePoll();
    } else if (isKnownSoftware) {
        if (autoPlay && loadPlayId === currentPlayRequestId) {
            playbackPromise = playWithSoftwareDecoder(track, initialTime, streamDirect && !prefersSoftware);
        } else {
            s.pendingSoftwareSeekSec = initialTime > 0 ? initialTime : null;
            s.isSoftwarePaused = true;
            syncPlayPauseUI(false);
        }
    } else if (autoPlay && loadPlayId === currentPlayRequestId) {
        playbackPromise = playAudio();
    } else {
        pauseAudio();
    }

    presentSecondaryTrackMeta(track, false);
    if (s.isLyricsView) {
        updateLyricsDisplay(track);
        if (targetTime > 0) updateActiveLyric(targetTime);
    }
    appendDebugTelemetry(`[LOAD] Track #${index + 1}: "${track.title || track.filename}" (${track.format || 'AUDIO'}, ${track.sampleRate || 44100}Hz)`);
    return await playbackPromise;
    } finally {release();}
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
    const release=serverLibraryGate.beginTransport();if(!release)return;
    try {
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
    s.playlistPlayback=null;
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
    const audioSrcBadge = document.getElementById('audioSourceBadge');
    if (audioSrcBadge) audioSrcBadge.textContent = 'STANDALONE';
    appendDebugTelemetry(`[STANDALONE LOAD] "${track.title || track.filename}" (${track.format || 'AUDIO'}, ${track.sampleRate || 44100}Hz)`);
    document.querySelectorAll('.trackItem.active').forEach(el => el.classList.remove('active'));
    if (totalDurationEl) totalDurationEl.textContent = formatTime(track.duration);
    if (miniTotalDuration) miniTotalDuration.textContent = formatTime(track.duration);
    presentTrackOnDeck(track, {
        isStandalone: true,
        artistFallback: 'External File',
        albumText: track.album ? `Album: ${track.album}${track.year ? ' (' + track.year + ')' : ''}` : 'Standalone File'
    });

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
    } finally {release();}
}

// The root-transition gate ensures no new transport operation can begin.
export function discardServerLibraryTransport() {
    const s=store.state;
    ++trackLoadToken;++currentPlayRequestId;++currentTrackGeneration;
    s.userExplicitlyPaused=true;s.isPlayPending=false;
    clearNoDataStallTimer();clearSeekStallTimer();
    if(activeLoadedMetadataHandler&&s.audio)s.audio.removeEventListener('loadedmetadata',activeLoadedMetadataHandler);
    stopSoftwarePlayback();s.activeDecodedBuffer=null;
    for(const audio of [s.audio,s.secondaryAudio])if(audio){audio.pause();audio.removeAttribute('src');audio.load();}
    s.preloadedNextTrackIndex=-1;s.currentTrack=null;s.currentTrackIndex=-1;s.playlistPlayback=null;
    s.isStandalonePlayback=false;updateStandaloneBannerUi(false);rememberTrack(safeStorage,null);
    syncPlayPauseUI(false,true);
}

// Centralized Play/Pause UI Synchronizer
function syncPlayPauseUI(playing, force = false) {
    if(!playing) interruptListening();
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
        playPauseBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
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
    repeatBtn.setAttribute('aria-label', `Repeat: ${s.repeatMode === 'one' ? 'one track' : s.repeatMode === 'all' ? 'all tracks' : 'off'}`);

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
    if(serverLibraryGate.rootPending)return;
    interruptListening();
    const s = store.state;
    if (typeof targetSec !== 'number' || !Number.isFinite(targetSec)) return;
    s.audioEditPaused=false;
    explicitTransportVersion++;
    nativeLoadOffset=Math.max(0,targetSec);
    if(androidNative?.active){androidNative.command('seek',targetSec);updatePlaybackProgress(targetSec,nativeDuration());return;}
    const track = (s.isStandalonePlayback && s.standaloneTrackList.length > 0)
        ? s.standaloneTrackList[s.standaloneTrackIndex]
        : s.allTracks[s.currentTrackIndex];
    if (s.isSoftwareDecoding) {
        if (s.activeDecodedBuffer) {
            seekSoftwarePlayback(targetSec);
            mediaSessionController.updatePositionState(true);
            if(track)mediaSessionController.syncAndroidNotification(track,s.isPlaying);
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
    if(track)mediaSessionController.syncAndroidNotification(track,s.isPlaying);
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
async function playAudio(userInitiated = false, {preserveOutput = false} = {}) {
    const release=serverLibraryGate.beginTransport();
    if(!release){showToast('Library directory is changing. Wait for completion or refresh.');return;}
    try {
    if (userInitiated) { explicitTransportVersion++; store.state.audioEditPaused = false; }
    const s = store.state;
    if(nativeReleasing)return;
    let skipNative=false;
    if(androidNative?.active){
        const status=androidNative.read();
        if(status?.state==='error'||status?.state==='unconfirmed'){const intent=playbackIntentVersion();if(!await stopNative()||intent!==playbackIntentVersion())return;skipNative=true;}
        else {s.userExplicitlyPaused=false;androidNative.command('play');return;}
    }
    if (s.isSoftwareDecoding) {
        s.userExplicitlyPaused = false;
        if(s.activeDecodedBuffer){if(!pcmStream&&s.isSoftwarePaused){await resumeSoftwarePlayback();}}else s.isSoftwarePaused=false;
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
    const directStream = mediaElementGeneration !== currentTrackGeneration && shouldUseDirectEngine(currentTrack);

    if ((isKnownSoftware || directStream) && !s.isSoftwareDecoding) {
        s.userExplicitlyPaused = false;
        syncPlayPauseUI(true);
        const startOffset = Number.isFinite(s.pendingSoftwareSeekSec) ? s.pendingSoftwareSeekSec : (s.audio?.currentTime||0);
        playWithSoftwareDecoder(currentTrack, startOffset, directStream && !isKnownSoftware);
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
    // Keep the request owned until start settles or the bounded start fails.

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

    let readyToPlay=false;
    try {
        const track = currentTrack;
        const targetRate = (track && track.sampleRate) ? getValidSampleRate(track.sampleRate) : 44100;
        // Skip redundant graph await if route is already confirmed and unchanged.
        if (!getConfirmedAudioRoute() || audioBufferChangePending()) {
            const graph = await ensureAudioEngineForSampleRate(targetRate);
            if (reqId !== currentPlayRequestId) return;
            if (!graph) throw new Error('Audio graph could not be initialized. Retry playback.');
        }
        await requirePlaybackGraph();
        if (reqId !== currentPlayRequestId) return;
        const activeAudio = s.audio;
        readyToPlay=true;
        // Do not restore a zero attenuation or change mute in a transport command.

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
        await startMediaWithDeadline(activeAudio);
        if (reqId !== currentPlayRequestId) return;
        syncPlayPauseUI(!activeAudio.paused);
    } catch (err) {
        if (reqId !== currentPlayRequestId) return;
        clearNoDataStallTimer();
        const errCode = s.audio && s.audio.error ? s.audio.error.code : 0;
        const shouldSoftwareFallback = readyToPlay && !s.userExplicitlyPaused && currentTrack && !s.isSoftwareDecoding
            && (err.name === 'NotSupportedError' || errCode === 3 || errCode === 4);
        if (shouldSoftwareFallback) {
            const rawSrc = (s.audio && (s.audio.getAttribute('src') || s.audio.src)) || '';
            rememberSoftwareDecoder(rawSrc);
            rememberSoftwareDecoder(currentTrack.src);
            const resumeAt = Number.isFinite(s.audio?.currentTime) ? s.audio.currentTime : 0;
            try {
                if (s.audio) {
                    s.audio.pause();
                    s.audio.removeAttribute('src');
                    s.audio.load();
                }
            } catch (_) {}
            logAudioPlaybackEvent('info', `HTML5 play() rejected (${err.name || 'code ' + errCode}) on "${currentTrack.title || currentTrack.filename}". Switching to 32-bit Web Audio Software Engine.`);
            playWithSoftwareDecoder(currentTrack, resumeAt);
            return;
        }
        if (err.name !== 'AbortError') {
            console.warn('Audio playback error:', err);
            s.userExplicitlyPaused=true;
            s.audio?.pause();
            showCachyToast('Playback unavailable',err.message||'Check audio output and retry.','error');
        }
        if (s.audio && s.audio.paused) {
            syncPlayPauseUI(false);
        }
    } finally {
        if (reqId === currentPlayRequestId) {
            s.isPlayPending = false;
        }
    }
    } finally {release();}
}

function pauseAudio({internalEdit=false}={}) {
    const s = store.state;
    if (internalEdit) s.audioEditPaused = true;
    else { explicitTransportVersion++; s.audioEditPaused = false; s.userExplicitlyPaused = true; }
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
    if(serverLibraryGate.rootPending)return;
    const s = store.state;
    if (s.audioEditPaused) { pauseAudio(); return; }
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
    if(s.isPlayPending){pauseAudio();return;}
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
    for(const queued of s.playQueue||[]){const qIdx=findTrackIndex(s.allTracks,queued);if(qIdx!==-1)return qIdx;}

    if(s.playlistPlayback)return playlistNeighbor(s);
    const pool = playbackPool(s);
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
            if(generation!==currentTrackGeneration||s.preloadedNextTrackIndex!==nextMasterIdx||s.allTracks[nextMasterIdx]!==nextTr)return;
            if (nextSrc.startsWith('../')) nextSrc = nextSrc.substring(3);
            if (!nextSrc){s.preloadedNextTrackIndex=-1;return;}

            if (!s.secondaryAudio) {
                s.secondaryAudio = document.createElement('audio');
                s.secondaryAudio.preload = 'auto';
                s.secondaryAudio.crossOrigin = 'anonymous';
            }
            s.secondaryAudio._preloadedTrack=nextTr;
            s.secondaryAudio._preloadedSource=nextSrc;
            s.secondaryAudio.src = nextSrc;
            releaseInactiveSources(s.audio?.getAttribute('src'),nextSrc);
            try { s.secondaryAudio.load(); } catch (_) {}
        }
    }
}

function executeGaplessHandoff(nextIndex, fromQueue=false) {
    if(serverLibraryGate.rootPending)return false;
    if (audioBufferChangePending() || hasActiveDsp() || store.state.mathPrecision!=='native' || getConfirmedAudioRoute()!=='direct' || store.state.audioContext?.state!=='running') return false;
    const rt = getRuntime();
    if (rt.isAndroidNative || rt.osFamily==='android' || window.innerWidth<=768 || store.state.isSoftwareDecoding) return false;
    const s = store.state;
    if (!s.secondaryAudio || s.preloadedNextTrackIndex !== nextIndex || s.secondaryAudio.readyState < 2 || s.secondaryAudio._preloadedTrack!==s.allTracks[nextIndex] || s.secondaryAudio._preloadedSource!==s.secondaryAudio.getAttribute('src')) {
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
        s.currentTrack=s.allTracks[nextIndex];
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
        s.currentTrack = nextTr;if(!fromQueue){const forward=historyNeighbor(s,1);if(forward?.index===nextIndex)seekPlaylistHistory(s,forward);}recordPlaylistVisit(s,nextTr,fromQueue);
        rememberTrack(safeStorage, nextTr);
        store.emit('track:change', { track: nextTr, index: nextIndex });

        s.userExplicitlyPaused = false;
        const handoffGeneration=currentTrackGeneration, handoffRequest=currentPlayRequestId, handoffAudio=s.audio;
        if(!getConfirmedAudioRoute())throw Error('Preloaded audio route unavailable');
        s.isPlayPending=true;
        startMediaWithDeadline(handoffAudio).then(() => {
            if(handoffGeneration!==currentTrackGeneration||handoffRequest!==currentPlayRequestId||s.audio!==handoffAudio||s.userExplicitlyPaused)return;
            syncPlayPauseUI(true);
            store.emit('visualizer:resume');
        }).catch(error=>{
            if(handoffGeneration!==currentTrackGeneration||handoffRequest!==currentPlayRequestId||s.audio!==handoffAudio||s.userExplicitlyPaused)return;
            s.audio?.pause();s.userExplicitlyPaused=true;syncPlayPauseUI(false);
            showCachyToast('Playback unavailable',error.message||'Press Play to retry.','error');
        }).finally(()=>{if(handoffRequest===currentPlayRequestId&&s.audio===handoffAudio)s.isPlayPending=false;});

        if (nextTr) {
            presentTrackOnDeck(nextTr);
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
        || !androidNative.supportsShuffle || s.playlistPlayback || !s.isShuffle || !nativeEligible(s.allTracks[s.currentTrackIndex])) return false;
    refreshNativeOrder(status);
    return androidNative.command(command);
}

async function nextTrack(manual = true, allowNative = true) {
    if(serverLibraryGate.rootPending)return;
    const s = store.state;
    const native = androidNative?.read();
    if (nativeReleasing || !syncNativeTrack(native)) return;
    reconcileNativeQueue(native);
    if (manual && allowNative && sendNativeShuffleCommand(native, 'next')) return;
    if (native && native.state !== 'stopped' && androidNative.supportsQueue && s.playQueue.length) {
        const loadToken = trackLoadToken, intent=playbackIntentVersion();
        if (!await stopNative() || loadToken !== trackLoadToken || intent!==playbackIntentVersion()) return;
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

    while (s.playQueue && s.playQueue.length > 0) {
        const nextQueuedTrack = s.playQueue.shift();
        store.emit('library:update-queue');
        const masterIdx = findTrackIndex(s.allTracks, nextQueuedTrack);
        if (masterIdx !== -1) {
            if (!executeGaplessHandoff(masterIdx,true)) {
                loadTrack(masterIdx, true, 0, null, false, true);
            }
            return;
        }
    }

    if(s.playlistPlayback){
        const index=playlistNeighbor(s);
        const forward=historyNeighbor(s,1);
        if(index<0){pauseAudio();seekAudio(0);return;}
        if(!executeGaplessHandoff(index))loadTrack(index,true,0,null,false,false,undefined,forward?.index===index?forward:null);return;
    }
    const pool = playbackPool(s);
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
    if(serverLibraryGate.rootPending)return;
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

    if(s.playlistPlayback){const previous=historyNeighbor(s,-1);if(previous){loadTrack(previous.index,true,0,null,false,true,undefined,previous);}else {seekAudio(0);playAudio(true);}return;}
    const pool = playbackPool(s);
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
function startSoftwareProgressLoop() {
    const s = store.state;
    cancelSoftwareProgressLoop();
    let lastProgressFrame = -Infinity;
    function tick(now) {
        if (!s.isSoftwareDecoding || s.isSoftwarePaused || !s.activeDecodedBuffer) return;
        const cur = softwarePosition();
        const dur = s.activeDecodedBuffer.duration;
        if (now - lastProgressFrame >= 66 || cur >= dur) {
            lastProgressFrame = now;
            const track=s.isStandalonePlayback?s.standaloneTrackList[s.standaloneTrackIndex]:s.allTracks[s.currentTrackIndex];
            observeListening(track,cur,dur,!s.isSoftwarePaused && !s.audioEditPaused && s.audioContext?.state==='running',1);
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
    if(s.audioContext.state!=='running'||!getConfirmedAudioRoute()){
        s.isSoftwarePaused=true;s.userExplicitlyPaused=true;syncPlayPauseUI(false);
        showCachyToast('Playback unavailable','Audio output is not running. Press Play to retry.','error');return;
    }
    if (s.activeDecodedBuffer.streaming) {startPcmPlayback();return;}
    if (s.softwareSourceNode) {
        try {
            s.softwareSourceNode.onended = null;
            s.softwareSourceNode.stop();
            s.softwareSourceNode.disconnect();
        } catch (_) {}
        s.softwareSourceNode = null;
    }

    let node;
    try {
        const ctx=s.audioContext, buffer=s.activeDecodedBuffer;
        node=ctx.createBufferSource();node.buffer=buffer;
        if (!s.softwareSourceGainNode || s.softwareSourceGainNode.context !== ctx) s.softwareSourceGainNode=ctx.createGain();
        node.connect(s.softwareSourceGainNode);s.softwareSourceNode=node;
        updateAudioRouting();
        if(ctx!==s.audioContext||ctx.state!=='running'||!getConfirmedAudioRoute())throw Error('Software audio route is not running.');
        const offset=Math.max(0,Math.min(buffer.duration,Number.isFinite(s.softwarePlaybackOffset)?s.softwarePlaybackOffset:0));
        s.softwarePlaybackOffset=offset;
        s.softwarePlaybackStartTime=ctx.currentTime;
        node.onended=()=>{
            if(s.softwareSourceNode!==node||!s.isSoftwareDecoding||s.isSoftwarePaused||s.activeDecodedBuffer!==buffer)return;
            onSoftwarePlaybackEnded();
        };
        node.start(0,offset);
        s.isSoftwarePaused=false;syncPlayPauseUI(true);startSoftwareProgressLoop();
    }catch(error){
        if(node){node.onended=null;try{node.stop();}catch{}try{node.disconnect();}catch{}}
        if(s.softwareSourceNode===node)s.softwareSourceNode=null;
        s.softwarePlaybackStartTime=0;s.isSoftwarePaused=true;s.userExplicitlyPaused=true;cancelSoftwareProgressLoop();syncPlayPauseUI(false);
        showCachyToast('Playback unavailable',error.message||'Software playback could not start.','error');
    }
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

async function resumeSoftwarePlayback() {
    if(serverLibraryGate.rootPending)return;
    const s = store.state;
    if (!s.isSoftwareDecoding || !s.activeDecodedBuffer) return;
    const request=++currentPlayRequestId,generation=currentTrackGeneration,buffer=s.activeDecodedBuffer;
    try{
        await requirePlaybackGraph();
        if(serverLibraryGate.rootPending||request!==currentPlayRequestId||generation!==currentTrackGeneration||s.activeDecodedBuffer!==buffer||s.userExplicitlyPaused)return;
        startSoftwareBufferPlayback();
    }catch(error){if(request!==currentPlayRequestId||generation!==currentTrackGeneration)return;
        s.isSoftwarePaused=true;s.userExplicitlyPaused=true;syncPlayPauseUI(false);showCachyToast('Playback unavailable',error.message,'error');}
}

function seekSoftwarePlayback(targetSec) {
    if(serverLibraryGate.rootPending)return;
    const s = store.state;
    if (!s.isSoftwareDecoding || !s.activeDecodedBuffer) return;
    const dur = s.activeDecodedBuffer.duration;
    const clamped = Math.max(0, Math.min(dur, targetSec));
    s.softwarePlaybackOffset = clamped;
    if (!s.isSoftwarePaused) {
        // Restart the owned stream. Seeking must never overlap a stateful decoder read.
        startSoftwareBufferPlayback();
    } else {
        updatePlaybackProgress(clamped, dur);
    }
}

function stopSoftwarePlayback() {
    const s = store.state;
    clearSeekStallTimer();
    abortActiveSoftwareFetch();
    stopPcmStream();pcmFile=null;
    releaseDirectFormat(s.activeDecodedBuffer);
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
    finishListeningVisit();
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

async function playWithSoftwareDecoder(track, startTime = 0, retryWebStream = false) {
    if(serverLibraryGate.rootPending)return;
    const s = store.state;
    if (!track) return;
    clearNoDataStallTimer();
    abortActiveSoftwareFetch();
    const decodeGen = currentTrackGeneration;
    stopPcmStream();pcmFile=null;
    releaseDirectFormat(s.activeDecodedBuffer);
    s.activeDecodedBuffer = null;
    s.isSoftwareDecoding = true;
    s.isSoftwarePaused = false;
    s.userExplicitlyPaused = false;
    syncPlayPauseUI(true);
    let streamJob = null;
    let publishedStream = false;

    try {
        if (s.audio) {
            try {
                s.audio.pause();
                s.audio.removeAttribute('src');
                s.audio.load();
            } catch (_) {}
        }

        const localFileJob = resolveLocalFile(track);
        streamJob = localFileJob.then(file => {
            if (typeof Worker !== 'function' || !canStreamPcmTrack(track, file)) return null;
            return preparePcmInput(track, file);
        }).catch(error => ({ error }));
        const targetRate = track.sampleRate ? getValidSampleRate(track.sampleRate) : 44100;
        const graph = await ensureAudioEngineForSampleRate(targetRate);
        if (decodeGen !== currentTrackGeneration) return;
        if (!graph) throw new Error('Software playback requires a ready audio graph.');
        await requirePlaybackGraph();
        if(decodeGen!==currentTrackGeneration||!s.isSoftwareDecoding)return;

        let src = track.src || '';
        if (src.startsWith('../')) src = src.substring(3);
        const ctxRate = s.audioContext ? s.audioContext.sampleRate : targetRate;
        const localFile = await localFileJob;
        const prepared = await streamJob;
        if(decodeGen!==currentTrackGeneration||!s.isSoftwareDecoding||s.audioContext!==graph)return;
        if (prepared?.error) {
            logAudioPlaybackEvent('warn', `Could not open the incremental audio stream: ${prepared.error.message}`);
        } else if (prepared) {
            const { file, format } = prepared;
            pcmFile = file;
            s.activeDecodedBuffer = format;
            publishedStream = true;
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
        // A URL can identify a replaced file. Only reuse an immutable Blob object.
        const cacheKey = localFile || null;
        let decodedBuffer = (cacheKey && softwareBufferCache.get(cacheKey)?.sampleRate===ctxRate)
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
                arrayBuf = await fetchBoundedAudio(src,{signal:abortCtrl?.signal});
            }
            if (activeDecodeAbortController === abortCtrl) activeDecodeAbortController = null;
            if (decodeGen !== currentTrackGeneration || !s.isSoftwareDecoding) return;

            logAudioPlaybackEvent('info', `Decompressing bitstream into 32-bit floating point audio buffer (${(arrayBuf.byteLength / (1024 * 1024)).toFixed(2)} MB)...`);
            softwareBufferCache.clear(); // Avoid retaining a prior decoded track during allocation.
            decodedBuffer = await compatibilityDecode(graph, arrayBuf, () => logAudioPlaybackEvent('info', 'Stripped prepended ID3v2 tag wrapper before FLAC decoding.'));
            if(decodeGen!==currentTrackGeneration||!s.isSoftwareDecoding||s.audioContext!==graph)return;
            await validateDecodedAudioBuffer(decodedBuffer,{maxBytes:MAX_PCM_BYTES,current:()=>decodeGen===currentTrackGeneration&&s.isSoftwareDecoding&&s.audioContext===graph});
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
    } finally {
        if (!publishedStream && streamJob) void streamJob.then(result => releaseDirectFormat(result?.format));
    }
}

const attachAudioListeners = createMediaElementListener({nativeActive:()=>Boolean(androidNative?.active), trackGeneration:()=>currentTrackGeneration, playbackIntent:playbackIntentVersion, clearPendingPlay:()=>{++currentPlayRequestId;}, syncPlayPauseUI, clearSeekStallTimer, clearNoDataStallTimer, rememberSoftwareDecoder, playWithSoftwareDecoder, pauseAudio, nextTrack, playAudio, checkAndPreloadNextTrack, mprisSyncHook});

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
    let restoredQueueCurrent=false;
    if (androidNative?.supportsQueue && !androidNative.active) {
        if (existing?.token && !s.playQueue.length) {
            s.playQueue = restoreNativeQueue(safeStorage.getItem(NATIVE_QUEUE_STORAGE), existing.token, s.allTracks);
            if (s.playQueue.length) store.emit('library:update-queue', { fromNative: true });
        }
        const consumed=new Set(existing?.consumedQueueIds||[]);
        restoredQueueCurrent=s.playQueue.some(t=>consumed.has(t.nativeQueueId)&&indexedSource(t)===existing?.uri);
        reconcileNativeQueue(existing);
        if (!existing?.token || existing.state === 'stopped') safeStorage.removeItem(NATIVE_QUEUE_STORAGE);
    }
    if(existing?.token&&existing.state!=='stopped'){
        const restored=restoreNativePlaylist(safeStorage.getItem(NATIVE_PLAYLIST_STORAGE),existing.token,s.allTracks);
        if(restored.invalid){if(!await stopNative())return;showToast('The previous playlist session could not be restored. Select a playlist to resume.');return;}
        s.playlistPlayback=restored.session;
        if(restored.session)s.isShuffle=restored.session.shuffle;
        const idx=s.allTracks.findIndex(t=>indexedSource(t)===existing.uri);
        if (idx >= 0 && nativeEligible(s.allTracks[idx])) {
            if (!s.playlistPlayback && androidNative.supportsShuffle && typeof existing.shuffle === 'boolean') {
                s.isShuffle = existing.shuffle;
                updateShuffleButton();
            }
            await loadTrack(idx, false, Number(existing.position || 0) / 1000, existing,false,Boolean(restoredQueueCurrent||s.playlistPlayback&&!s.playlistPlayback.ordered.some(t=>indexedSource(t)===existing.uri)));
            rememberNativeQueue(existing.token);
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

    for (const id of ['muteBtn', 'miniMuteBtn']) document.getElementById(id)?.setAttribute('aria-pressed', String(Boolean(audio?.muted)));
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
        getSnapshot: () => {
            const s=store.state;
            if(androidNative?.active){const v=androidNative.read();return {position:Number(v?.position||0)/1000,duration:Number(v?.duration||0)/1000,playing:v?.state==='playing'};}
            if(s.isSoftwareDecoding)return {position:softwarePosition(),duration:s.activeDecodedBuffer?.duration||0,playing:!s.isSoftwarePaused};
            return {position:s.audio?.currentTime||0,duration:s.audio?.duration||0,playing:!!s.audio&&!s.audio.paused&&!s.audio.ended};
        },
        getPlaybackRate: () => store.state.isSoftwareDecoding ? 1.0 : (store.state.audio?.playbackRate || store.state.currentPlaybackSpeed || 1.0)
    });
}

// Reconfigure a loaded library track through the existing transport owner.
// No direct destruction of an active graph from the Settings controller.
async function reloadForAudioPreference() {
    const s = store.state;
    if (s.isStandalonePlayback || !s.allTracks[s.currentTrackIndex] || s.isPlayPending || nativeReleasing) return false;
    if (!androidNative?.active && !s.isSoftwareDecoding && !s.audio?.getAttribute('src')) return false;
    const position = androidNative?.active ? nativePosition() : s.isSoftwareDecoding ? softwarePosition() : s.audio?.currentTime || 0;
    const duration = androidNative?.active ? nativeDuration() : s.isSoftwareDecoding ? s.activeDecodedBuffer?.duration : s.audio?.duration;
    // loadTrack's end-of-track restoration rule would otherwise restart the song.
    if (Number.isFinite(duration) && duration > 0 && position >= duration - 1) return false;
    const playing = s.isPlaying && !s.userExplicitlyPaused;
    await loadTrack(s.currentTrackIndex, playing, position);
    return true;
}
store.state.isNativePlaybackActive = () => Boolean(androidNative?.active);
// Native playback does not use the Web Audio DSP route. Do not interrupt it for
// an inaudible Web Audio setting; backend switches use their own reload path.
store.state.audioEditIntent = () => `${currentTrackGeneration}:${explicitTransportVersion}`;
store.state.withAudioEdit = createAudioEditGuard({
    isPlaying: () => store.state.isPlaying && !androidNative?.active,
    pause: () => pauseAudio({internalEdit:true}),
    resume: () => { store.state.audioEditPaused=false; return playAudio(false, {preserveOutput:true}); },
    onUnsafe: () => { pauseAudio(); showToast('Audio recovery failed. Playback stopped; check settings before retrying.'); },
    finishPause: (failed, sameOwner) => { if (store.state.audioEditPaused) { store.state.audioEditPaused=false; if (failed && sameOwner) store.state.userExplicitlyPaused=true; } },
    identity: store.state.audioEditIntent,
    acquire: () => outputHold.acquire(),
    release: () => outputHold.release(),
    acknowledge: acknowledgeAudioEdit
});

store.state.applyBufferProfileNow = async () => {
    if (!audioBufferChangePending() || androidNative?.active) return false;
    return reloadForAudioPreference();
};
const nativeModeControl = document.getElementById('androidNativeMode');
if (nativeModeControl) {
    const row = nativeModeControl.closest('.settingsRowItem');
    row.hidden = !androidNative;
    if (!androidNative) row.style.display = 'none';
    nativeModeControl.checked = safeStorage.getItem('cachymusic_android_native') === 'true';
    nativeModeControl.addEventListener('change', async () => {
        const next = nativeModeControl.checked;
        nativeModeControl.checked = safeStorage.getItem('cachymusic_android_native') === 'true';
        nativeModeControl.disabled = true;
        try { if (!await confirmAudioChange('androidNative', next)) return; }
        finally { nativeModeControl.disabled = false; }
        nativeModeControl.checked = next;
        safeStorage.setItem('cachymusic_android_native', String(next));
        const s = store.state;
        if (!androidNative || s.isStandalonePlayback) return;
        if (Boolean(androidNative.active) !== Boolean(nativeEligible(s.currentTrack))) {
            nativeModeControl.disabled = true;
            try { if (!await reloadForAudioPreference()) showToast('Playback mode saved for the next eligible track.'); }
            catch (error) { console.warn('Playback mode change failed', error); showToast('Playback mode saved; current track could not be reloaded.'); }
            finally { nativeModeControl.disabled = false; }
        }
    });
}
const continuousPcmControl = document.getElementById('continuousPcmMode');
if (continuousPcmControl) {
    continuousPcmControl.checked = safeStorage.getItem('cachymusic_continuous_pcm') === 'true';
    continuousPcmControl.addEventListener('change', async () => {
        const next = continuousPcmControl.checked;
        continuousPcmControl.checked = safeStorage.getItem('cachymusic_continuous_pcm') === 'true';
        continuousPcmControl.disabled = true;
        try { if (!await confirmAudioChange('continuousPcm', next)) return; }
        finally { continuousPcmControl.disabled = false; }
        continuousPcmControl.checked = next;
        safeStorage.setItem('cachymusic_continuous_pcm', String(next));
        if (!continuousPcmControl.checked) cancelPcmSuccessor();
        else if (pcmStream) { pcmStream.lastAttempt = null; checkPcmSuccessor(pcmStream); }
        else if (continuousPcmEnabled() && pcmExtension(store.state.currentTrack) && typeof Worker === 'function') {
            continuousPcmControl.disabled = true;
            try { if (!await reloadForAudioPreference()) showToast('Continuous playback saved for the next compatible track.'); }
            catch (error) { console.warn('Continuous playback change failed', error); showToast('Continuous playback saved; current track could not be reloaded.'); }
            finally { continuousPcmControl.disabled = false; }
        }
    });
}

store.subscribe('playback:seek', (e) => {
    const d = e?.detail;
    if (!d || typeof d.time !== 'number') return;
    seekAudio(d.time);
    if (d.play) playAudio(true);
});
store.subscribe('playback:pause', () => pauseAudio());
store.subscribe('playback:order-change', () => {syncPlaylistShuffle(store.state);invalidatePcmSuccessor();updateShuffleButton();refreshNativeOrder();});
store.subscribe('playback:sleep-mode-change', () => {
    if (store.state.sleepTimerMode === 'end') cancelPcmSuccessor();
    refreshNativeOrder();
});
store.subscribe('library:update-queue', event => {
    if (event.detail?.fromNative) return;
    invalidatePcmSuccessor();
    nativeQueueEdits++;
    refreshNativeOrder();
});
store.subscribe('library:update', invalidatePcmSuccessor);
store.subscribe('dsp:change', invalidatePcmSuccessor);
store.subscribe('ui:sync-signal-path', () => updateSignalPathUi());
store.subscribe('ui:sync-dac-status', () => updateDacStatusUi());
store.subscribe('ui:sync-track-badge', (e) => updateTrackBadgeUi(e?.detail?.track));
store.subscribe('ui:sync-volume-icon', (e) => updateVolumeIcon(e?.detail?.volume ?? store.state.currentVolumeValue));
store.subscribe('audio:processor-failed',()=>{
    if(androidNative?.active)return;pauseAudio();showToast('Audio processor failed. Press Play to retry using the available route.');
});
store.subscribe('audio:graph-interrupted',()=>{
    const s=store.state;
    if(androidNative?.active||(!s.isPlaying&&!s.isPlayPending))return;
    pauseAudio();showToast('Audio output interrupted. Press Play when the device is available.');
});
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
    clearNoDataStallTimer();
    clearSeekStallTimer();
    stopSoftwarePlayback();
    softwareBufferCache.clear();
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
