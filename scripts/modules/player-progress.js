import {store} from './state.js';
import {formatTime} from './utils.js';
import {currentTimeEl, miniCurrentTime, progressBar, miniProgressBar} from './ui-elements.js';
import {updateActiveLyric} from './lyrics.js';

// Shared timeline rendering for native, media-element and software transport.
export function updatePlaybackProgress(cur, dur) {
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
    cur = Number.isFinite(cur) ? Math.max(0, cur) : 0;
    const formattedTime = formatTime(cur);
    if (currentTimeEl && currentTimeEl.textContent !== formattedTime) currentTimeEl.textContent = formattedTime;
    if (miniCurrentTime && miniCurrentTime.textContent !== formattedTime) miniCurrentTime.textContent = formattedTime;
    const valid=Number.isFinite(dur)&&dur>0, max=valid?Math.ceil(dur):0, now=Math.max(0,Math.min(max,Math.floor(Number.isFinite(cur)?cur:0)));
    for(const control of [document.getElementById('progressCon'),document.getElementById('miniProgressCon')]){
        if(!control)continue;
        const values={'aria-valuemax':String(max),'aria-valuenow':String(now),'aria-valuetext':`${formatTime(now)} of ${formatTime(max)}`,'aria-disabled':String(!valid)};
        for(const [key,value] of Object.entries(values))if(control.getAttribute(key)!==value)control.setAttribute(key,value);
    }

    {
        const pct = valid ? Math.min(100, Math.max(0, (cur / dur) * 100)) : 0;
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

