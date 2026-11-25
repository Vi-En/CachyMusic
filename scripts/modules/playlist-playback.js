import {findTrackIndex} from './track-session.js';
import {shuffleMembers} from './playlist-model.js';

// Session membership is a snapshot. Editing or browsing never mutates it.
export function startPlaylistSession(state, id, members, shuffle=false, first=null) {
    const ordered=shuffle?shuffleMembers(members):members.slice();
    if(first){const at=findTrackIndex(ordered,first);if(at<0)return false;if(shuffle)ordered.unshift(...ordered.splice(at,1));}
    const cursor=first?findTrackIndex(ordered,first):0;
    if(!ordered.length||cursor<0)return false;
    state.playlistPlayback={id,ordered,cursor,shuffle,saved:members.slice(),history:[],historyIndex:-1,historyTarget:null};
    state.isShuffle=shuffle;
    return true;
}
export function playbackPool(state) {return state.playlistPlayback?.ordered ?? (state.displayedTracks?.length?state.displayedTracks:state.allTracks);}
export function notePlaylistTrack(state,track) {
    const session=state.playlistPlayback;if(!session)return;
    const at=findTrackIndex(session.ordered,track);
    if(at>=0)session.cursor=at;
}
export function playlistNeighbor(state,direction=1) {
    const session=state.playlistPlayback;if(!session)return -1;
    if(direction===1){const forward=historyNeighbor(state,1);if(forward)return forward.index;}
    const pool=session.ordered,n=pool.length;if(!n)return -1;
    for(let distance=1;distance<=n;distance++){
        let pos=session.cursor+direction*distance;
        if(pos<0||pos>=n){if(state.repeatMode!=='all')return -1;pos=(pos%n+n)%n;}
        const index=findTrackIndex(state.allTracks,pool[pos]);if(index>=0)return index;
    }
    return -1;
}
// Explicit shuffle changes reorder the unplayed suffix only. Already-played
// tracks keep their relative positions. Disabling shuffle restores saved order
// of the remaining membership, not the currently browsed library.
export function syncPlaylistShuffle(state) {
    const session=state.playlistPlayback;if(!session||session.shuffle===state.isShuffle)return;
    const prefix=session.ordered.slice(0,session.cursor+1);
    const remaining=session.ordered.slice(session.cursor+1);
    const remainingSet=new Set(remaining);
    const suffix=state.isShuffle?shuffleMembers(remaining):session.saved.filter(t=>remainingSet.has(t));
    const prior=session.ordered;session.ordered=[...prefix,...suffix];session.shuffle=state.isShuffle;
    if(session.history){session.history.splice(session.historyIndex+1);for(const entry of session.history){const anchor=prior[entry.cursor];const cursor=session.ordered.indexOf(anchor);if(cursor>=0)entry.cursor=cursor;}}
}

// Bounded actual visit history, including explicit queue interruptions.
// Every entry remembers the membership cursor separately from its track.
const HISTORY_LIMIT=512;
export function recordPlaylistVisit(state,track,fromQueue=false) {
    const session=state.playlistPlayback;if(!session||!track)return;
    const history=session.history ||= [];
    const pending=session.historyTarget;
    if(pending!=null&&history[pending]&&findTrackIndex([track],history[pending].track)===0){
        session.historyIndex=pending;session.cursor=history[pending].cursor;session.historyTarget=null;return;
    }
    session.historyTarget=null;
    if(!fromQueue)notePlaylistTrack(state,track);
    const last=history[session.historyIndex];
    if(last&&findTrackIndex([last.track],track)===0&&last.cursor===session.cursor&&!fromQueue)return;
    history.splice((session.historyIndex??-1)+1);
    history.push({track,cursor:session.cursor});
    if(history.length>HISTORY_LIMIT)history.shift();
    session.historyIndex=history.length-1;
}
export function historyNeighbor(state,direction) {
    const session=state.playlistPlayback;if(!session?.history?.length)return null;
    for(let pos=session.historyIndex+direction;pos>=0&&pos<session.history.length;pos+=direction){
        const index=findTrackIndex(state.allTracks,session.history[pos].track);
        if(index>=0)return {index,pos};
    }
    return null;
}
export function seekPlaylistHistory(state,target){if(state.playlistPlayback&&target)state.playlistPlayback.historyTarget=target.pos;}
