export function localDay(date){return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;}
export function periodStart(period, now){
    const d=new Date(now);d.setHours(0,0,0,0);
    if(period==='week')d.setDate(d.getDate()-(d.getDay()+6)%7);
    else if(period==='month')d.setDate(1);
    else if(period==='year')d.setMonth(0,1);
    else return '0000-01-01';
    return localDay(d);
}
const compareRank=(a,b)=>b.count-a.count||String(a.title).localeCompare(String(b.title))||String(a.key).localeCompare(String(b.key));
export function rankListening(items){return [...items].sort(compareRank);}
export function createRankAccumulator(limit=50){
    const items=[];let count=0;
    return {add(row){count++;if(items.length===limit&&compareRank(row,items[limit-1])>=0)return;let lo=0,hi=items.length;while(lo<hi){const mid=(lo+hi)>>1;if(compareRank(row,items[mid])<0)hi=mid;else lo=mid+1;}items.splice(lo,0,row);if(items.length>limit)items.pop();},result(){return {items,count};}};
}
// Count once per track visit after 30 seconds of observed playback (half of a
// shorter track). Seek jumps and suspended polling intervals do not qualify.
export function createListeningCounter(commit){
    let key=null,last=null,elapsed=0,counted=false;
    function reset(){key=null;last=null;elapsed=0;counted=false;}
    return {reset,breakSample(){last=null;},sample(track,id,pos,dur,playing,rate,now){
        if(key!==id){reset();key=id;}
        if(!playing||!Number.isFinite(pos)||!Number.isFinite(now)||!Number.isFinite(dur)||dur<=0){last=null;return;}
        const current={pos,now};
        if(last&&!counted){const dt=(now-last.now)/1000,delta=pos-last.pos;const speed=Number.isFinite(rate)&&rate>0?rate:1;
            if(dt>0&&dt<=3&&delta>0&&delta<=dt*speed+0.12){elapsed+=Math.min(delta/speed,dt);}
            if(elapsed>=Math.min(30,dur/2)){counted=true;commit(track);}
        }last=current;
    }};
}

// History identity is not a playlist row ID. Prefer a source and file fingerprint;
// metadata fallback is deliberately conservative when immutable file details are absent.
const unknownIdentities = new WeakMap();
export function visitId(){return globalThis.crypto?.randomUUID?.() || Array.from(globalThis.crypto.getRandomValues(new Uint8Array(16)),v=>v.toString(16).padStart(2,'0')).join('');}
export function recordingKey(track,{allowUnresolved=true}={}){
    if(!track || typeof track !== 'object')return '';
    const source=track.contentUri || track.uri || track.fullPath || track._fileBlob?.name;
    const size=track.fileSize ?? track._fileBlob?.size ?? track.file_size ?? track.size;
    const modified=track.lastModified ?? track._fileBlob?.lastModified ?? track.mtime;
    if(source){
        const kind=track._fileBlob || String(track.id||'').startsWith('local_')?'local':'source';
        const fingerprint=size!=null&&modified!=null?[size,modified]:[size??null,track.title||'',track.artist||'',track.album||'',track.duration||0];
        return 'recording:'+JSON.stringify([kind,String(source),fingerprint]);
    }
    if(!allowUnresolved)return "";
    if(!unknownIdentities.has(track))unknownIdentities.set(track,visitId());
    return 'unresolved:'+unknownIdentities.get(track);
}
