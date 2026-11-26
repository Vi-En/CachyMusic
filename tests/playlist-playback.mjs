import assert from 'node:assert/strict';
import {startPlaylistSession,playlistNeighbor,notePlaylistTrack,playbackPool,syncPlaylistShuffle,recordPlaylistVisit,historyNeighbor,seekPlaylistHistory} from '../scripts/modules/playlist-playback.js';
import {nextPcmCandidate} from '../scripts/modules/pcm-transition.js';
import {buildNativeOrder,saveNativePlaylist,restoreNativePlaylist} from '../scripts/modules/android-native-playback.js';
const tracks=['a','b','outside'].map(id=>({id,src:'https://appassets.androidplatform.net/android-media?uri='+encodeURIComponent('content://test/'+id),title:id}));
const [a,b,outside]=tracks;const s={allTracks:tracks,displayedTracks:[outside],currentTrackIndex:0,repeatMode:'off',playQueue:[],isShuffle:false};
assert(startPlaylistSession(s,'p',[a,b]));assert.deepEqual(playbackPool(s),[a,b]);assert.equal(playlistNeighbor(s),1);assert.equal(nextPcmCandidate(s).track,b);assert.equal(buildNativeOrder(s).tracks.length,2);
s.displayedTracks=[];assert.equal(nextPcmCandidate(s).track,b);s.currentTrackIndex=1;notePlaylistTrack(s,b);assert.equal(playlistNeighbor(s),-1);assert.equal(nextPcmCandidate(s),null);assert.equal(buildNativeOrder(s).tracks.length,2);s.repeatMode='all';assert.equal(playlistNeighbor(s),0);
s.repeatMode='off';s.currentTrackIndex=0;notePlaylistTrack(s,a);s.playQueue=[outside];assert.equal(nextPcmCandidate(s).track,outside);s.playQueue=[];s.currentTrackIndex=2;assert.equal(playlistNeighbor(s),1);assert.equal(nextPcmCandidate(s).track,b);s.isShuffle=true;syncPlaylistShuffle(s);assert.equal(s.playlistPlayback.shuffle,true);assert.deepEqual(s.playlistPlayback.ordered,[a,b]);s.allTracks=[a,outside];assert.equal(playlistNeighbor(s),-1);
console.log('PASS snapshot independence, explicit queue candidate, end/repeat, PCM and native order boundary');

s.allTracks=tracks;s.repeatMode='off';startPlaylistSession(s,'history',[a,b]);recordPlaylistVisit(s,a);recordPlaylistVisit(s,outside,true);recordPlaylistVisit(s,b);assert.equal(s.playlistPlayback.cursor,1);let previous=historyNeighbor(s,-1);assert.equal(previous.index,2);seekPlaylistHistory(s,previous);recordPlaylistVisit(s,outside,true);assert.equal(s.playlistPlayback.cursor,0);assert.equal(playlistNeighbor(s),1);previous=historyNeighbor(s,-1);seekPlaylistHistory(s,previous);recordPlaylistVisit(s,a,true);assert.equal(playlistNeighbor(s),2);const forward=historyNeighbor(s,1);seekPlaylistHistory(s,forward);recordPlaylistVisit(s,outside,true);assert.equal(s.playlistPlayback.cursor,0);assert.equal(historyNeighbor(s,1).index,1);console.log('PASS playlist visit history includes explicit queue and restores cursor across Previous/Next');

const raw=saveNativePlaylist('native-token',s.playlistPlayback);const restored=restoreNativePlaylist(raw,'native-token',tracks);assert.equal(restored.invalid,false);assert.equal(restored.session.cursor,s.playlistPlayback.cursor);assert.equal(restored.session.historyIndex,s.playlistPlayback.historyIndex);assert.equal(restored.session.history[1].track,outside);assert.equal(restoreNativePlaylist(raw,'other',tracks).session,null);assert.equal(restoreNativePlaylist(raw,'native-token',[a,b]).invalid,true);console.log('PASS native token-scoped snapshot roundtrip and fail-closed missing membership');

// Saturate the bounded visit history with real repeat-all successor selection.
const saturated={allTracks:tracks,displayedTracks:[],repeatMode:'all',playQueue:[]};
assert(startPlaylistSession(saturated,'saturated',[a,b]));
recordPlaylistVisit(saturated,a);
for(let i=0;i<2048;i++){
 const next=playlistNeighbor(saturated);assert(next>=0&&next<2);
 recordPlaylistVisit(saturated,tracks[next]);
 if(i%13===0)recordPlaylistVisit(saturated,outside,true);
 assert(saturated.playlistPlayback.history.length<=512);
}
assert.equal(saturated.playlistPlayback.history.length,512);
assert.equal(saturated.playlistPlayback.historyIndex,511);
for(let i=0;i<511;i++){
 const target=historyNeighbor(saturated,-1);assert(target);seekPlaylistHistory(saturated,target);recordPlaylistVisit(saturated,tracks[target.index],true);
}
assert.equal(historyNeighbor(saturated,-1),null);
for(let i=0;i<511;i++){
 const target=historyNeighbor(saturated,1);assert(target);seekPlaylistHistory(saturated,target);recordPlaylistVisit(saturated,tracks[target.index],true);
}
assert.equal(historyNeighbor(saturated,1),null);
const stableRaw=saveNativePlaylist('saturated',saturated.playlistPlayback);
assert.equal(restoreNativePlaylist(stableRaw,'saturated',tracks).session.history.length,512);
console.log('PASS history saturation after 2,048 playlist successors, bounded queue visits, retained history traversal and native serialization');
