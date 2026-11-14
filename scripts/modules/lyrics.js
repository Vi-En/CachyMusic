// CachyMusic - Synchronized LRC Lyrics Engine
import { escapeHtml, safeStorage } from './utils.js';
import { store } from './state.js';
import {
    lyricsArtistName,
    lyricsCon,
    lyricsContent,
    lyricsScrollArea,
    lyricsToggleBtn,
    lyricsTrackName,
    turntableCon
} from './ui-elements.js';

    // Parse Lyrics (supporting standard text and timestamped LRC format [mm:ss.xx])
    function parseLyrics(raw) {
        if (!raw || typeof raw !== 'string' || !raw.trim()) return null;
        const lines = raw.split(/\r?\n/);
        const parsed = [];
        const lrcRegex = /\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/g;
        let hasTimestamps = false;

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            const timeMatches = [...trimmed.matchAll(lrcRegex)];
            if (timeMatches.length > 0) {
                hasTimestamps = true;
                const textOnly = trimmed.replace(lrcRegex, '').trim();
                for (const match of timeMatches) {
                    const min = parseInt(match[1], 10);
                    const sec = parseInt(match[2], 10);
                    const ms = match[3] ? parseInt(match[3].padEnd(3, '0').slice(0, 3), 10) : 0;
                    const time = min * 60 + sec + (ms / 1000);
                    parsed.push({ time, text: textOnly || '♪' });
                }
            } else if (!trimmed.match(/^\[[a-zA-Z]+:.*\]$/)) {
                // Regular line (ignore ID tags like [ar:Artist])
                parsed.push({ time: -1, text: trimmed });
            }
        }

        if (hasTimestamps) {
            parsed.sort((a, b) => a.time - b.time);
        }

        return { isSynced: hasTimestamps, lines: parsed, raw };
    }

    // Update Lyrics Displayer Content
    function updateLyricsDisplay(track) {
        if (!lyricsTrackName || !lyricsArtistName || !lyricsContent) return;

        store.state.activeLyricIndex = -1;
        const title = track ? (track.title || track.filename || 'Select A Track') : '—';
        const artist = track ? (track.artist || 'Unknown Artist') : '—';
        lyricsTrackName.textContent = title;
        lyricsArtistName.textContent = artist;

        const lyricsRaw = track ? track.lyrics : null;
        const parsedLyrics = parseLyrics(lyricsRaw);
        store.state.parsedLyrics = parsedLyrics;

        if (!parsedLyrics || parsedLyrics.lines.length === 0) {
            lyricsContent.innerHTML = `
                <div class="lyricsPlaceholder">
                    <div class="lyricsPlaceholderIcon">♪</div>
                    <p>No lyrics available for this track.</p>
                    <span>Lyrics can be embedded via the<br>USLT/LYRICS tag in your audio files or in a .lrc file.</span>
                </div>
            `;
            return;
        }

        let html = '';
        parsedLyrics.lines.forEach((item, idx) => {
            const timeAttr = item.time >= 0 ? ` data-time="${item.time.toFixed(2)}"` : '';
            const isClickable = item.time >= 0 ? ' clickable' : '';
            const clickTitle = isClickable ? ' title="Click to jump playback to this line"' : '';
            html += `<div class="lyricLine lyricsLine${isClickable}" data-index="${idx}"${timeAttr}${clickTitle}>${escapeHtml(item.text)}</div>`;
        });
        lyricsContent.innerHTML = html;

        // Interactive seeking when clicking synced lyric lines
        if (parsedLyrics.isSynced) {
            lyricsContent.querySelectorAll('.lyricLine.clickable').forEach(el => {
                el.addEventListener('click', () => {
                    const t = parseFloat(el.dataset.time);
                    if (!isNaN(t)) {
                        try {
                            const audioEl = store.state.audio;
                            const dur = audioEl ? audioEl.duration : 0;
                            if (t > 0 && (!dur || isNaN(dur) || t < (dur - 1))) {
                                safeStorage.setItem('cachymusic_last_track_time', t.toFixed(2));
                            }
                        } catch (_) {}
                        store.emit('playback:seek', { time: t, play: true });
                    }
                });
            });
            const audioEl = store.state.audio;
            updateActiveLyric(audioEl ? audioEl.currentTime : 0);
        }
    }

    // Highlight and Scroll Active Lyric Line for Synced LRC
    function updateActiveLyric(currentTime) {
        const s = store.state;
        if (!s.isLyricsView || !s.parsedLyrics || !s.parsedLyrics.isSynced || !lyricsContent) return;
        const lines = s.parsedLyrics.lines;
        let newIdx = -1;
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].time <= currentTime + 0.15) {
                newIdx = i;
            } else {
                break;
            }
        }

        if (newIdx !== s.activeLyricIndex) {
            s.activeLyricIndex = newIdx;
            const allEls = lyricsContent.querySelectorAll('.lyricLine');
            allEls.forEach((el, i) => {
                if (i === s.activeLyricIndex) {
                    el.classList.add('active');
                    if (lyricsScrollArea) {
                        const elTop = el.offsetTop - lyricsScrollArea.offsetTop;
                        const targetScroll = elTop - (lyricsScrollArea.clientHeight / 2) + (el.clientHeight / 2);
                        lyricsScrollArea.scrollTo({ top: Math.max(0, targetScroll), behavior: 'smooth' });
                    }
                } else {
                    el.classList.remove('active');
                }
            });
        }
    }

    // Toggle Lyrics Displayer (takes over turntable upon toggle, returns to turntable upon disable)
    function toggleLyricsView(forcedState) {
        if (!lyricsToggleBtn || !lyricsCon || !turntableCon) return;

        const nextState = (forcedState !== undefined) ? !!forcedState : !store.state.isLyricsView;
        store.setState({ isLyricsView: nextState }, ['lyrics:change']);

        if (nextState) {
            lyricsToggleBtn.classList.add('active');
            lyricsToggleBtn.setAttribute('title', 'Return to Turntable View (L)');
            const textSpan = lyricsToggleBtn.querySelector('span');
            if (textSpan) textSpan.textContent = 'TURNTABLE';
            turntableCon.style.display = 'none';
            turntableCon.classList.add('lyricsActiveHidden');
            lyricsCon.classList.remove('lyricsActiveHidden');
            lyricsCon.style.display = 'flex';
            updateLyricsDisplay(store.state.allTracks[store.state.currentTrackIndex]);
        } else {
            lyricsToggleBtn.classList.remove('active');
            lyricsToggleBtn.setAttribute('title', 'Toggle Lyrics View (L)');
            const textSpan = lyricsToggleBtn.querySelector('span');
            if (textSpan) textSpan.textContent = 'LYRICS';
            turntableCon.classList.remove('lyricsActiveHidden');
            turntableCon.style.display = '';
            lyricsCon.classList.add('lyricsActiveHidden');
            lyricsCon.style.display = 'none';
        }
    }

    export {
        parseLyrics,
        updateLyricsDisplay,
        updateActiveLyric,
        toggleLyricsView
    };

