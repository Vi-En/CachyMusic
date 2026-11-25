import {playbackPool, playlistNeighbor} from './playlist-playback.js';
// SPDX-License-Identifier: GPL-3.0-or-later
// A single prebuffered successor. No second clock, graph rebuild or crossfade.
export function sameTrack(a,b) {
    if(!a||!b)return false;
    if(a===b)return true;
    if(a.id&&b.id)return String(a.id)===String(b.id);
    if(a.tid&&b.tid)return String(a.tid)===String(b.tid);
    return !!a.fullPath&&a.fullPath===b.fullPath;
}
export function nextPcmCandidate(state) {
    if(state.isStandalonePlayback)return null;
    const all=state.allTracks, current=all[state.currentTrackIndex];
    if(!current)return null;
    if(state.repeatMode==='one')return {track:current,index:state.currentTrackIndex,queue:null};
    const first=state.playQueue?.[0];
    if(first){const index=all.findIndex(t=>sameTrack(t,first));return index<0?null:{track:all[index],index,queue:first};}
    if(state.playlistPlayback){const index=playlistNeighbor(state);return index<0?null:{track:all[index],index,queue:null};}
    const pool=playbackPool(state);
    if(state.isShuffle)return null; // normal shuffle owns random selection
    const pos=pool.findIndex(t=>sameTrack(t,current));
    if(pos<0)return null;
    const next=pool[pos+1]||(state.repeatMode==='all'?pool[0]:null);
    const index=all.findIndex(t=>sameTrack(t,next));
    return index<0?null:{track:all[index],index,queue:null};
}
export function sameCandidate(a,b){return !!a&&!!b&&a.track===b.track&&a.index===b.index&&a.queue===b.queue;}
export function canScheduleSuccessor(current, successor, guard=0.045){
    return current.started&&!current.closed&&current.cursor===current.frames&&
        successor.ready&&!successor.closed&&!successor.started&&
        current.ctx===successor.ctx&&current.destination===successor.destination&&
        current.endTime-current.ctx.currentTime>=guard;
}
