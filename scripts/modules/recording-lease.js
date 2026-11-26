// Cooperative desktop-only recording reservation. A lost renewal never stops
// audio. The backend expires abandoned reservations; it does not infer a stop.
export function serverRecording(state){
    if(state.isStandalonePlayback||state.userExplicitlyPaused||!(state.isPlaying||state.isPlayPending||state.audio?.paused===false||(state.isSoftwareDecoding&&!state.isSoftwarePaused)))return null;
    const t=state.currentTrack||state.allTracks?.[state.currentTrackIndex];
    const path=t?.fullPath||t?.full_path;
    if(!t||typeof path!=='string'||!path||path.length>4096||!(/^[1-9]\d*$/.test(String(t.tid??'')))||!(/^(?:\.\.?\/)?php\/api\/stream\.php\?tid=\d+$/.test(t.src||''))||String(t.src).split('=')[1]!==String(t.tid))return null;
    return {tid:String(t.tid),path};
}
const randomOwner=()=>Array.from(crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join('');
export function createRecordingLease({read,fetcher=fetch,makeOwner=randomOwner,now=()=>performance.now(),warn=()=>{}}){
    let owner=makeOwner(),last=null,stamp=0,busy=false,dirty=false,closed=false,warned=false;
    const identity=t=>t?JSON.stringify(t):null;
    async function refresh(){
        if(closed)return;
        if(busy){dirty=true;return;}
        const target=read(),key=identity(target);
        if(key===last&&(key===null||now()-stamp<20000))return;
        busy=true;dirty=false;
        const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),5000);
        try{
            const response=await fetcher('php/api/recording_lease.php',{method:'POST',headers:{'Content-Type':'application/json'},cache:'no-store',signal:controller.signal,body:JSON.stringify(target?{action:'renew',owner,...target}:{action:'release',owner})});
            if(!response.ok||(await response.json())?.success!==true)throw Error('Reservation unavailable');
            last=key;stamp=now();warned=false;
        }catch(error){
            // A timed-out request may have been accepted. Retire its owner so
            // a late response cannot overwrite a later reservation. TTL bounds
            // the conservative extra protection; never replay an old request.
            owner=makeOwner();last=null;stamp=0;
            if(target&&!warned){warned=true;warn(error);}
        }finally{
            clearTimeout(timer);busy=false;
            if(dirty&&!closed&&identity(read())!==key)void refresh();
        }
    }
    return {refresh,close(){closed=true;}};
}
export function installRecordingLease(store,warn){
    if(!globalThis.crypto?.getRandomValues)return;
    const lease=createRecordingLease({read:()=>serverRecording(store.state),warn});
    const tick=()=>{void lease.refresh();};
    store.subscribe('track:change',tick);store.subscribe('audio:spectrum-refresh',tick);
    // Background throttling is why the server lease is explicitly advisory.
    setInterval(tick,15000);document.addEventListener('visibilitychange',tick);tick();
}
