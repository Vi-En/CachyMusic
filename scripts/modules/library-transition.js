// In-process mutual exclusion for root publication and transport acquisition.
// An unconfirmed root change remains blocked until a fresh client is loaded.
export function createLibraryGate(){
    let root=null,transports=0;
    return {
        beginTransport(){if(root)return null;transports++;let released=false;return ()=>{if(!released){released=true;transports--;}};},
        beginRoot(state){
            if(root||transports||state.isPlaying||state.isPlayPending||state.audio?.paused===false||state.isSoftwareDecoding&&!state.isSoftwarePaused)return null;
            const owner={};root=owner;return {confirm(){if(root===owner)root=null;}};
        },
        get busy(){return transports>0;},get rootPending(){return root!==null;}
    };
}
export const serverLibraryGate=createLibraryGate();

// Path similarity alone is insufficient: a server stream URL may contain an
// obsolete track ID even when a rescan matches the same pathname.
export function sameServerTransport(a,b){
    if(!a||!b)return false;
    if(a===b)return true;
    return Boolean(a.fullPath&&a.src&&a.fullPath===b.fullPath&&a.src===b.src&&String(a.tid??'')===String(b.tid??''));
}
