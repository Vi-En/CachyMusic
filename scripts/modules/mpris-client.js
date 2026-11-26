// Desktop MPRIS HTTP bridge. One command request and one state POST at a time.
export function createMprisClient({state: s, actions, fetchRequest = globalThis.fetch, host = window, page = document}) {
    let running = false, generation = 0, timer = null, commandAbort = null, reportAbort = null;
    let pending = null, sending = false, idle = 0, lastKey = null, lastPosition = -Infinity;
    const clientId = Array.from(globalThis.crypto.getRandomValues(new Uint8Array(16)), value => value.toString(16).padStart(2,'0')).join('');
    let acknowledgement = null;
    const jsonPost = body => ({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    async function acknowledge(controller) {
        const receipt=acknowledgement;
        if (!receipt) return true;
        const data=await request('ack_command',jsonPost(receipt),controller,async response=>{
            if (response.status===409) return {terminal:true};
            if (!response.ok) throw Error('MPRIS acknowledgement failed');
            return response.json();
        });
        if (data?.terminal || (data?.success && data.id===receipt.id && ['dispatched','failed','uncertain'].includes(data.outcome))) {
            if (acknowledgement===receipt) acknowledgement=null;
            return true;
        }
        return false;
    }
    const endpoint = 'php/api/mpris_state.php?action=';
    function getCurrentPlaybackTiming() {
        const track = (s.isStandalonePlayback && s.standaloneTrackList.length > 0)
            ? s.standaloneTrackList[s.standaloneTrackIndex]
            : s.allTracks[s.currentTrackIndex];
        if (s.isSoftwareDecoding && s.activeDecodedBuffer) {
            const pos = actions.softwarePosition();
            return {
                track,
                isPlaying: !s.isSoftwarePaused,
                position: Math.max(0, pos),
                duration: s.activeDecodedBuffer.duration || (track ? track.duration : 0) || 0,
                volume: s.currentVolumeValue
            };
        }
        const a = s.audio;
        return {
            track,
            isPlaying: Boolean(a && !a.paused && !a.ended),
            position: a ? (a.currentTime || 0) : 0,
            duration: (a && a.duration && isFinite(a.duration)) ? a.duration : ((track ? track.duration : 0) || 0),
            volume: a ? a.volume : s.currentVolumeValue
        };
    }

    async function request(action, options, controller, read = response => response.ok) {
        const timeout = setTimeout(() => controller.abort(), 5000);
        try { return await read(await fetchRequest(endpoint + action, {...options, signal: controller.signal})); }
        finally { clearTimeout(timeout); }
    }
    async function flush() {
        if (!running || sending || !pending) return;
        sending = true;
        const current = generation, payload = pending;
        pending = null;
        const controller = new AbortController(); reportAbort = controller;
        try {
            const result = await request('update_state', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)}, controller, async response => {
                await response.body?.cancel();
                return response.ok;
            });
            if (!result && current === generation) lastKey = null;
        } catch (_) { if (current === generation) lastKey = null; }
        finally {
            sending = false; reportAbort = null;
            if (running && pending) void flush();
        }
    }
    function reportState(force = false) {
        if (!running) return;
        const info = getCurrentPlaybackTiming(), track = info.track;
        const status = info.isPlaying ? 'Playing' : (info.position > 0 ? 'Paused' : 'Stopped');
        const cover = String(track?.cover || '');
        const payload = {status, position:info.position || 0, duration:info.duration || 0,
            title:track ? (track.title || track.filename || 'Unknown') : 'CachyMusic',
            artist:track ? (track.artist || 'Unknown Artist') : '', album:track?.album || '',
            artUrl:cover && (/^(https?:|data:|blob:)/.test(cover) ? cover : host.location.origin + '/' + cover),
            coverPath:cover.startsWith('data:') ? '' : cover, volume:info.volume, shuffle:s.isShuffle, repeat:s.repeatMode};
        const key = [status, payload.title, payload.artist, payload.album, cover, payload.duration, payload.volume, payload.shuffle, payload.repeat];
        if (!force && lastKey && key.every((value, i) => value === lastKey[i]) && Math.abs(info.position - lastPosition) < 2) return;
        lastKey = key; lastPosition = info.position;
        pending = payload; void flush();
    }
    async function pollCommands() {
        if (!running || commandAbort) return;
        const current = generation, controller = new AbortController(); commandAbort = controller;
        try {
            if (acknowledgement && !await acknowledge(controller)) return;
            if (!running || current!==generation) return;
            const started=performance.now();
            const data = await request('get_command', jsonPost({client:clientId}), controller, async response => {
                if (!response.ok) throw Error('MPRIS request failed');
                return response.json();
            });
            if (!running || current !== generation) return;
            if (data?.command) {
                if (!/^[a-f0-9]{32}$/.test(data.id || '') || !Number.isFinite(data.lease_ms) || data.lease_ms <= performance.now()-started+100) return;
                idle = 0;
                // Record before dispatch: no repeated non-idempotent action if ACK fails.
                acknowledgement={id:data.id,client:clientId,outcome:'failed'};
                const cmd = data.command, info = getCurrentPlaybackTiming();
                if (cmd === 'PlayPause') {
                    if (info.isPlaying) actions.pauseAudio();
                    else Promise.resolve(actions.playAudio(true)).catch(()=>{});
                } else if (cmd === 'Play') {
                    Promise.resolve(actions.playAudio(true)).catch(()=>{});
                } else if (cmd === 'Pause') {
                    actions.pauseAudio();
                } else if (cmd === 'Stop') {
                    actions.pauseAudio();
                    actions.seekAudio(0);
                } else if (cmd === 'Next') {
                    Promise.resolve(actions.nextTrack()).catch(()=>{});
                } else if (cmd === 'Previous') {
                    Promise.resolve(actions.prevTrack()).catch(()=>{});
                } else if (cmd === 'Seek' && Number.isFinite(data.offset)) {
                    actions.seekAudio(Math.max(0, info.position + data.offset));
                } else if (cmd === 'SeekTo' && Number.isFinite(data.position)) {
                    actions.seekAudio(Math.max(0, data.position));
                } else if (cmd === 'SetVolume' && Number.isFinite(data.volume)) {
                    actions.setVolume(Math.max(0, Math.min(1.5, data.volume)), true);
                } else if (cmd === 'ToggleShuffle') {
                    s.isShuffle = !s.isShuffle;
                    actions.orderChanged();
                } else if (cmd === 'SetShuffle' && typeof data.shuffle === 'boolean') {
                    s.isShuffle = data.shuffle;
                    actions.orderChanged();
                } else if (cmd === 'SetLoopStatus' && typeof data.loopStatus === 'string') {
                    const ls = data.loopStatus.toLowerCase();
                    if (ls === 'track') s.repeatMode = 'one';
                    else if (ls === 'playlist') s.repeatMode = 'all';
                    else s.repeatMode = 'off';
                    actions.updateRepeatUI();
                    actions.orderChanged();
                } else {
                    throw Error('Invalid or unsupported MPRIS command');
                }
                acknowledgement.outcome='dispatched';
                reportState(true);
                await acknowledge(controller);
            } else idle++;
        } catch (_) { if (current === generation) idle += 2; }
        finally {
            commandAbort = null;
            if (running) schedule(page.hidden || idle > 10 ? 1200 : idle > 3 ? 700 : 350);
        }
    }
    function schedule(delay) {
        clearTimeout(timer);
        timer = setTimeout(() => { timer = null; void pollCommands(); }, delay);
    }
    function start() {
        if (running) return;
        running = true; generation++; idle = 0; lastKey = null;
        if (!commandAbort) schedule(500);
        reportState(true);
    }
    function stop() {
        running = false; generation++; clearTimeout(timer); timer = null; pending = null; lastKey = null;
        commandAbort?.abort(); reportAbort?.abort();
    }
    host.addEventListener('pagehide', stop);
    host.addEventListener('pageshow', start);
    return {start, stop, reportState, dispose() { stop(); host.removeEventListener('pagehide', stop); host.removeEventListener('pageshow', start); }};
}
