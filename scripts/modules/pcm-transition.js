import {playbackPool, playlistNeighbor} from './playlist-playback.js';
// SPDX-License-Identifier: GPL-3.0-or-later
// A single prebuffered successor. No second clock, graph rebuild or crossfade.
// Prebuffering is optional: if identity is contradictory or ambiguous, leave
// the decision to the ordinary transport instead of guessing an audible source.
export function sameTrack(a,b) {
    if(!a||!b)return false;
    if(a===b)return true;
    const keys=['id','tid','fullPath','contentUri','src'];
    for(const key of ['fileSize','lastModified'])if(a[key]!=null&&b[key]!=null&&String(a[key])!==String(b[key]))return false;
    let matched=false;
    for(const k of keys){
        if(a[k]==null||a[k]===''||b[k]==null||b[k]==='')continue;
        if(String(a[k])!==String(b[k]))return false;
        if(k!=='src')matched=true;
    }
    return matched;
}
export function uniqueTrackIndex(pool,target){
    if(!target)return -1;
    const exact=pool.indexOf(target);if(exact>=0)return exact;
    let index=-1;
    for(let i=0;i<pool.length;i++)if(sameTrack(pool[i],target)){if(index!==-1)return -1;index=i;}
    return index;
}
// Snapshot the source fields, not the mutable catalog object. Tag-only changes
// do not invalidate a prepared successor, but replacement data does.
function fingerprint(track){return JSON.stringify(['id','tid','fullPath','contentUri','src','fileSize','lastModified'].map(k=>track[k]==null?null:String(track[k])));}
function candidate(track,index,queue){return {track,index,queue,sourceIdentity:fingerprint(track),blob:track._fileBlob||track.fileBlob||null};}
export function nextPcmCandidate(state) {
    if(state.isStandalonePlayback)return null;
    const all=state.allTracks, current=all[state.currentTrackIndex];
    if(!current)return null;
    if(state.repeatMode==='one')return candidate(current,state.currentTrackIndex,null);
    const first=state.playQueue?.[0];
    if(first){const index=uniqueTrackIndex(all,first);return index<0?null:candidate(all[index],index,first);}
    if(state.playlistPlayback){const index=playlistNeighbor(state);return index<0?null:candidate(all[index],index,null);}
    const pool=playbackPool(state);
    if(state.isShuffle)return null; // normal shuffle owns random selection
    const pos=uniqueTrackIndex(pool,current);
    if(pos<0)return null;
    const next=pool[pos+1]||(state.repeatMode==='all'?pool[0]:null);
    const index=uniqueTrackIndex(all,next);
    return index<0?null:candidate(all[index],index,null);
}
export function sameCandidate(a,b){return !!a&&!!b&&a.track===b.track&&a.index===b.index&&a.queue===b.queue&&a.sourceIdentity===b.sourceIdentity&&a.blob===b.blob;}
export function canScheduleSuccessor(current, successor, guard=0.045){
    return current.started&&!current.closed&&(!current.ctx.state||current.ctx.state==='running')&&current.cursor===current.frames&&
        current.scheduledFrames===current.frames-current.first&&
        successor.ready?.length>0&&!successor.closed&&!successor.started&&
        current.ctx===successor.ctx&&current.destination===successor.destination&&
        current.endTime-current.ctx.currentTime>=guard;
}
