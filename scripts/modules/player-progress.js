import {store} from './state.js';
import {formatTime} from './utils.js';
import {currentTimeEl, miniCurrentTime, progressBar, progressCon, miniProgressBar, miniProgressCon, persistentMiniPlayer, playerDeckEl} from './ui-elements.js';
import {updateActiveLyric} from './lyrics.js';

let lastProgressCur = 0;
let lastProgressDur = 0;

function syncBarControl(control, valid, max, now) {
    if (!control) return;
    const values = {
        'aria-valuemax': String(max),
        'aria-valuenow': String(now),
        'aria-valuetext': `${formatTime(now)} of ${formatTime(max)}`,
        'aria-disabled': String(!valid)
    };
    for (const [key, value] of Object.entries(values)) {
        if (control.getAttribute(key) !== value) control.setAttribute(key, value);
    }
}

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
    lastProgressCur = cur;
    lastProgressDur = dur;

    const inOtherWorkspace = typeof document !== 'undefined' && (document.body.classList.contains('view-soulseek') || document.body.classList.contains('view-settings'));
    const deckHiddenOnMobile = typeof document !== 'undefined' && Boolean(playerDeckEl) && document.body.classList.contains('view-player') && (document.body.classList.contains('mobile-tab-tracks') || document.body.classList.contains('mobile-tab-info')) && !playerDeckEl.classList.contains('mobileActive');
    const showMain = !inOtherWorkspace && !deckHiddenOnMobile;
    const showMini = Boolean(persistentMiniPlayer && persistentMiniPlayer.style.display !== 'none');

    const formattedTime = formatTime(cur);
    if (showMain && currentTimeEl && currentTimeEl.textContent !== formattedTime) currentTimeEl.textContent = formattedTime;
    if (showMini && miniCurrentTime && miniCurrentTime.textContent !== formattedTime) miniCurrentTime.textContent = formattedTime;

    const valid = Number.isFinite(dur) && dur > 0;
    const max = valid ? Math.ceil(dur) : 0;
    const now = Math.max(0, Math.min(max, Math.floor(cur)));
    if (showMain) syncBarControl(progressCon || document.getElementById('progressCon'), valid, max, now);
    if (showMini) syncBarControl(miniProgressCon || document.getElementById('miniProgressCon'), valid, max, now);

    const pct = valid ? Math.min(100, Math.max(0, (cur / dur) * 100)) : 0;
    const pctStr = `${pct}%`;
    if (showMain && progressBar && progressBar.style.width !== pctStr) progressBar.style.width = pctStr;
    if (showMini && miniProgressBar && miniProgressBar.style.width !== pctStr) miniProgressBar.style.width = pctStr;

    if (cur > 1.0 && s.consecutiveSkipCount > 0) {
        s.consecutiveSkipCount = 0;
    }

    if (s.isLyricsView) {
        updateActiveLyric(cur);
    }
}

if (typeof store?.subscribe === 'function') {
    store.subscribe('workspace:change', () => {
        if (lastProgressCur > 0 || lastProgressDur > 0) {
            updatePlaybackProgress(lastProgressCur, lastProgressDur);
        }
    });
}

