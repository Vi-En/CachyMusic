import {store} from './state.js';
import {pushModalState,popModalState} from './utils.js';
import {createListeningCounter, localDay, periodStart, createRankAccumulator,recordingKey,visitId} from './listening-history-model.js';

// One database per browser profile/origin. Generation is checked in the same
// transaction as an idempotent visit write, so an old tab cannot undo a clear.
const preference='cachymusic_listening_history_enabled', generationKey='cachymusic_listening_generation', clearKey='cachymusic_listening_clear_pending';
let dbPromise, storageError='',dialogEpoch=0,initialized=false,rankTx=null,refreshOpenHistory=null;
function readEnabled(){try{return localStorage.getItem(preference)!=='false';}catch{return false;}}
function generation(){try{const value=localStorage.getItem(generationKey)||'0';return /^(0|[1-9]\d{0,14})$/.test(value)?value:null;}catch{return null;}}
function clearPending(){try{return Boolean(localStorage.getItem(clearKey));}catch{return true;}}
function publishGeneration(value){const old=generation();if(old===null||Number(value)>Number(old))localStorage.setItem(generationKey,value);}
let trackingEnabled=readEnabled(), currentVisit=null, nativeSync=null, nativePollAt=0;
const bridge=()=>typeof window!=='undefined'?window.AndroidBridge:null;
export function hasNativeListening(){return typeof bridge()?.nativeListeningPending==='function'&&typeof bridge()?.nativeListeningConfigure==='function'&&typeof bridge()?.nativeListeningAcknowledge==='function';}
function configureNativeHistory(erase=false){
    if(!hasNativeListening())return true;
    const gen=generation();if(gen===null){try{bridge().nativeListeningConfigure(false,'0',false);}catch{}return false;}
    try{return bridge().nativeListeningConfigure(enabled()&&!erase,gen,erase)===true;}catch{return false;}
}
// A blocked or malformed receipt must not prevent unrelated valid receipts from
// being imported. Retain failed receipts, and bound the work of each invocation.
export function syncNativeHistory(force=false){
    if(!hasNativeListening()||!enabled()||nativeSync||(!force&&Date.now()<nativePollAt))return nativeSync;
    nativePollAt=Date.now()+5000;
    const owner=bridge();
    nativeSync=(async()=>{
        await openHistory();
        let failed=false;
        for(let round=0;round<4;round++){
            if(!enabled()||bridge()!==owner)break;
            const raw=owner.nativeListeningPending();
            if(typeof raw!=='string'||raw.length>1000000)throw Error('Invalid native listening batch size.');
            const batch=JSON.parse(raw);
            if(!Array.isArray(batch)||batch.length>32)throw Error('Invalid native listening batch.');
            if(!batch.length)break;
            let acknowledged=0;
            for(const event of batch){
                if(!enabled()||bridge()!==owner)break;
                if(!event||typeof event.id!=='string'||!/^native-[a-zA-Z0-9-]{1,64}$/.test(event.id)||typeof event.key!=='string'||!(event.key.startsWith('native-source:')||event.key.startsWith('recording:'))||event.key.length>20000||typeof event.day!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(event.day)||typeof event.title!=='string'||typeof event.artist!=='string'){failed=true;continue;}
                if(event.generation!==generation()){failed=true;continue;}
                try{
                    if(await persistListeningVisit({...event,title:event.title.slice(0,512),artist:event.artist.slice(0,512)})){
                        if(owner.nativeListeningAcknowledge(event.id,event.generation))acknowledged++;else failed=true;
                    }else failed=true;
                }catch{failed=true;}
            }
            // Stop after any failure to avoid immediately retrying the same disk
            // write or receipt. A full successful batch may have more pending.
            if(failed||acknowledged!==batch.length||batch.length<32)break;
            await new Promise(resolve=>setTimeout(resolve,0));
        }
        const warning=owner.nativeListeningWarning?.();
        if(failed)storageError='Some native listening receipts could not be synchronized; they were retained for retry.';
        else if(warning)storageError=String(warning).slice(0,512);
        else if(storageError.startsWith('Some native listening receipts')||storageError==='Native listening history could not be synchronized.')storageError='';
    })().catch(()=>{storageError='Native listening history could not be synchronized.';}).finally(()=>{nativeSync=null;});
    return nativeSync;
}
const enabled=()=>trackingEnabled&&readEnabled()&&!clearPending();
export function openHistory(){
    if(dbPromise)return dbPromise;
    const opening=new Promise((resolve,reject)=>{
        const req=indexedDB.open('cachymusic-listening-history',2);
        let abandoned=false;
        const timeout=setTimeout(()=>{abandoned=true;reject(new Error('History database open timed out.'));},10000);
        req.onupgradeneeded=()=>{
            const db=req.result,tx=req.transaction;if(abandoned){tx.abort();return;}
            if(!db.objectStoreNames.contains('days'))db.createObjectStore('days',{keyPath:['day','key']});
            db.createObjectStore('visits',{keyPath:'id'});
            const totals=db.createObjectStore('totals',{keyPath:'key'});
            db.createObjectStore('meta',{keyPath:'key'}).put({key:'generation',value:generation()||'0'});
            // v1 keys are not permanent recording identities. Preserve their counts
            // under the old key, never merge them with new recording identities.
            const cursor=tx.objectStore('days').openCursor();
            cursor.onsuccess=()=>{const c=cursor.result;if(!c)return;const row=c.value;
                const r=totals.get(row.key);r.onsuccess=()=>{totals.put({...row,count:(r.result?.count||0)+row.count,legacy:true});c.continue();};};
        };
        req.onblocked=()=>{storageError='Listening history is waiting for another app window to close.';};
        req.onerror=()=>{clearTimeout(timeout);reject(req.error);};
        req.onsuccess=()=>{const db=req.result;if(abandoned){db.close();return;}
            db.onversionchange=()=>{db.close();if(dbPromise===opening)dbPromise=null;};
            db.onclose=()=>{if(dbPromise===opening)dbPromise=null;};
            try{const r=db.transaction('meta','readonly').objectStore('meta').get('generation');r.onsuccess=()=>{clearTimeout(timeout);if(abandoned){db.close();return;}try{publishGeneration(r.result?.value||'0');}catch{}resolve(db);};r.onerror=()=>{clearTimeout(timeout);db.close();reject(r.error);};}catch(error){clearTimeout(timeout);db.close();reject(error);}};
    });
    dbPromise=opening;opening.catch(()=>{if(dbPromise===opening)dbPromise=null;});return opening;
}
function transactionDone(tx){return new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error||new Error('History transaction aborted.'));});}
// A receipt identifies exactly one immutable recording/day/generation. Do not
// acknowledge a conflicting reuse of an ID merely because the ID exists.
function validVisit(event){
    if(!event||typeof event.id!=='string'||event.id.length<1||event.id.length>128||typeof event.key!=='string'||!event.key||event.key.length>20000||typeof event.generation!=='string'||!/^(0|[1-9]\d{0,14})$/.test(event.generation)||typeof event.day!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(event.day)||typeof event.title!=='string'||typeof event.artist!=='string')return false;
    const date=new Date(event.day+'T00:00:00Z');
    return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===event.day;
}
export async function persistListeningVisit(event){
    if(!validVisit(event))return false;
    const db=await openHistory();
    if(!enabled()||event.generation!==generation())return false;
    const tx=db.transaction(['meta','visits','days','totals'],'readwrite',{durability:'strict'}),done=transactionDone(tx);
    let accepted=false;
    const meta=tx.objectStore('meta').get('generation');
    meta.onsuccess=()=>{
        if((meta.result?.value||'0')!==event.generation||!enabled()||event.generation!==generation())return;
        const visits=tx.objectStore('visits'),lookup=visits.get(event.id);
        lookup.onsuccess=()=>{
            if(lookup.result){
                const receipt=lookup.result;
                // Older receipts only stored their ID. Preserve idempotency for
                // those records; new receipts can detect conflicting payloads.
                accepted=receipt.key===undefined||(receipt.key===event.key&&receipt.day===event.day&&receipt.generation===event.generation);
                return;
            }
            // Preferences may change while the asynchronous lookup is pending.
            if(!enabled()||event.generation!==generation())return;
            visits.add({id:event.id,key:event.key,day:event.day,generation:event.generation});
            for(const [name,key] of [['days',[event.day,event.key]],['totals',event.key]]){
                const rows=tx.objectStore(name),r=rows.get(key);
                r.onsuccess=()=>rows.put({day:event.day,key:event.key,title:event.title.slice(0,512),artist:event.artist.slice(0,512),count:(r.result?.count||0)+1});
            }
            accepted=true;
        };
    };
    await done;return accepted;
}
async function record(track){
    if(!currentVisit||!enabled()||currentVisit.generation===null)return;
    const {track:ignored,...visit}=currentVisit;
    const event={...visit,day:localDay(new Date()),title:String(track.title||track.filename||'Unknown track').slice(0,512),artist:String(track.artist||'Unknown artist').slice(0,512)};
    // Retry the same id, never increment twice after an ambiguous commit.
    for(let attempt=0;attempt<3;attempt++){
        if(!enabled()||generation()!==event.generation)return;
        try{if(await persistListeningVisit(event))storageError='';else storageError='A listening visit was not saved (history changed).';return;}
        catch{if(attempt<2)await new Promise(r=>setTimeout(r,250*(attempt+1)));}
    }
    storageError='A qualified listening visit could not be saved in this app profile.';
}
const counter=createListeningCounter(track=>{void record(track);});
export function observeListening(track,position,duration,playing,rate){
    const key=recordingKey(track);if(!key){counter.breakSample();return;}
    if(!currentVisit||currentVisit.key!==key&&currentVisit.track!==track){currentVisit={key,id:visitId(),generation:generation(),track};counter.reset();}
    if(currentVisit.nativeOwned||!enabled()||currentVisit.generation!==generation()){counter.breakSample();return;}
    counter.sample(track,currentVisit.id,position,duration,playing,rate,performance.now());
}
export function interruptListening(){counter.breakSample();}
// Native journal owns its visit. Do not double count on a mid-track WebView handoff.
export function markNativeListening(track){
    if(!currentVisit||currentVisit.track!==track){currentVisit={key:recordingKey(track),id:visitId(),generation:generation(),track,nativeOwned:true};counter.reset();}
    else currentVisit.nativeOwned=true;
    counter.breakSample();
}
export function finishListeningVisit(){currentVisit=null;counter.reset();}
store.subscribe('track:change',e=>{if(e?.detail?.preserveListening)counter.breakSample();else finishListeningVisit();});
if(typeof window!=='undefined')window.addEventListener('storage',e=>{
    if(e.key===preference||e.key===null){trackingEnabled=readEnabled();counter.breakSample();configureNativeHistory();const checkbox=document.getElementById('listeningEnabled');if(checkbox)checkbox.checked=enabled();}
    if(e.key===generationKey||e.key===clearKey||e.key===null){counter.breakSample();configureNativeHistory();const checkbox=document.getElementById('listeningEnabled');if(checkbox)checkbox.checked=enabled();++dialogEpoch;cancelRanks();refreshOpenHistory?.();}
});
let clearOperation=null;
export function clearListeningHistory(){
    if(clearOperation)return clearOperation;
    clearOperation=(async()=>{
        const db=await openHistory(), token=visitId();
        // Survives reload between the native erase and browser transaction.
        // Incomplete deletion must keep tracking disabled until explicitly retried.
        localStorage.setItem(clearKey,token);
        counter.breakSample();
        if(!configureNativeHistory(true)){
            configureNativeHistory();
            throw Error('Native history could not be cleared.');
        }
        const tx=db.transaction(['days','totals','visits','meta'],'readwrite',{durability:'strict'}),done=transactionDone(tx);
        let next;const meta=tx.objectStore('meta'),r=meta.get('generation');
        r.onsuccess=()=>{
            const previous=String(r.result?.value||'0');
            if(!/^(0|[1-9]\d{0,14})$/.test(previous)||Number(previous)>=999999999999999){tx.abort();return;}
            const cached=generation();
            if(cached===null||Number(cached)>=999999999999999){tx.abort();return;}
            next=String(Math.max(Number(previous),Number(cached))+1);
            for(const name of ['days','totals','visits'])tx.objectStore(name).clear();meta.put({key:'generation',value:next});
        };
        await done;publishGeneration(next);
        if(localStorage.getItem(clearKey)===token)localStorage.removeItem(clearKey);
        if(!configureNativeHistory()){
            // Keep the barrier if the bridge cannot confirm the new generation.
            if(!clearPending())localStorage.setItem(clearKey,token);
            configureNativeHistory();
            throw Error('Native history generation could not be synchronized.');
        }
        counter.breakSample();storageError='';
    })().catch(error=>{storageError=clearPending()?'History deletion was not confirmed. Tracking is paused; retry Clear history.':'History deletion was not confirmed; retry Clear history.';throw error;}).finally(()=>{clearOperation=null;});
    return clearOperation;
}
function cancelRanks(){if(rankTx){try{rankTx.abort();}catch{}rankTx=null;}}
async function readRanks(period,epoch){
    const db=await openHistory();if(epoch!==dialogEpoch)return {items:[],count:0};
    const start=periodStart(period,new Date()),end=localDay(new Date()),all=period==='all';
    const tx=db.transaction(all?'totals':'days','readonly');rankTx=tx;
    const cursor=tx.objectStore(all?'totals':'days').openCursor(all?undefined:IDBKeyRange.bound([start],[end,'\uffff']));
    const totals=all?null:new Map(),rank=createRankAccumulator();
    cursor.onsuccess=()=>{const c=cursor.result;if(!c)return;const row=c.value;if(all)rank.add(row);else{const old=totals.get(row.key);totals.set(row.key,{...row,count:(old?.count||0)+row.count});}c.continue();};
    try{await transactionDone(tx);if(totals)for(const row of totals.values())rank.add(row);return rank.result();}finally{if(rankTx===tx)rankTx=null;}
}
export function initListeningHistory({playTrack}={}){
    if(initialized)return;initialized=true;
    if(hasNativeListening()){
        // Disable until the database generation has been confirmed.
        try{bridge().nativeListeningConfigure(false,generation()||'0',false);}catch{}
        void openHistory().then(()=>{if(!configureNativeHistory())throw Error('Native privacy configuration failed.');return syncNativeHistory(true);}).catch(()=>{storageError='Native listening history initialization failed.';});
        document.addEventListener('visibilitychange',()=>{if(!document.hidden)void syncNativeHistory(true);});
    }
    const dialog=document.getElementById('listeningHistoryDialog'),trigger=document.getElementById('listeningHistoryBtn');if(!dialog||!trigger)return;
    const period=document.getElementById('listeningPeriod'),rows=document.getElementById('listeningRows'),status=document.getElementById('listeningStatus'),checkbox=document.getElementById('listeningEnabled'),clear=document.getElementById('listeningClear');
    async function render(){
        const epoch=++dialogEpoch;cancelRanks();rows.replaceChildren();status.textContent='Loading listening history…';
        try{const {items,count:total}=await readRanks(period.value,epoch);if(epoch!==dialogEpoch||!dialog.open)return;
            status.textContent=(clearPending()?'History deletion was not confirmed. Tracking is paused; retry Clear history.':storageError)||(!items.length?'No qualified plays in this period yet.':`Showing ${items.length} of ${total} tracks.`);
            const fragment=document.createDocumentFragment();
            // Resolve only unique exact recording identities. Never guess from title or row ID.
            const wanted=new Set(items.map(item=>item.key).filter(key=>key.startsWith('recording:'))),matches=new Map();
            const catalog=store.state.allTracks||[];
            if(typeof playTrack==='function'&&wanted.size)for(const [index,track] of catalog.entries()){
                if(index>0&&index%4096===0){await new Promise(resolve=>setTimeout(resolve,0));if(epoch!==dialogEpoch||!dialog.open)return;if(store.state.allTracks!==catalog){void render();return;}}
                const key=recordingKey(track,{allowUnresolved:false});if(wanted.has(key))matches.set(key,matches.has(key)?null:{index,track});
            }
            for(const [i,item] of items.slice(0,50).entries()){
                const row=document.createElement('li'),rank=document.createElement('span'),meta=document.createElement('span'),title=document.createElement('strong'),artist=document.createElement('small'),count=document.createElement('span');
                rank.textContent=String(i+1);title.textContent=item.title;artist.textContent=item.artist+(!item.key.startsWith('recording:')?' · Unverified recording':'');meta.append(title,artist);count.textContent=`${item.count} ${item.count===1?'play':'plays'}`;row.append(rank,meta,count);
                const match=matches.get(item.key);if(match){const action=document.createElement('button');action.type='button';action.className='listeningPlay';action.textContent='Play';action.setAttribute('aria-label',`Play ${item.title}`);action.addEventListener('click',()=>{const library=store.state.allTracks||[];if(library!==catalog||library[match.index]!==match.track||recordingKey(match.track,{allowUnresolved:false})!==item.key||library.some((track,index)=>index!==match.index&&recordingKey(track,{allowUnresolved:false})===item.key)){status.textContent='Library changed. Refresh the ranking before playing.';return;}dialog.close();playTrack(match.index);});row.append(action);}
                fragment.append(row);
            }rows.append(fragment);
        }catch{if(epoch===dialogEpoch)status.textContent=storageError||'Listening history is unavailable in this browser.';}
    }
    refreshOpenHistory=()=>{if(dialog.open)void render();};
    let returnFocus=null;const open=()=>{if(dialog.open)return;returnFocus=document.activeElement;checkbox.checked=enabled();dialog.showModal();pushModalState(dialog.id);if(hasNativeListening())void Promise.resolve(syncNativeHistory(true)).then(()=>{if(dialog.open)render();});else render();};
    trigger.addEventListener('click',open);document.getElementById('privacyListeningBtn')?.addEventListener('click',open);
    dialog.addEventListener('close',()=>{++dialogEpoch;cancelRanks();rows.replaceChildren();popModalState(dialog.id);(returnFocus||trigger).focus();});
    period.addEventListener('change',render);
    checkbox.addEventListener('change',()=>{if(clearPending()){checkbox.checked=false;status.textContent='Retry Clear history before enabling tracking.';return;}try{localStorage.setItem(preference,String(checkbox.checked));trackingEnabled=checkbox.checked;counter.breakSample();if(!configureNativeHistory()){status.textContent='Native tracking preference could not be confirmed.';}else if(enabled())void syncNativeHistory(true);}catch{checkbox.checked=enabled();status.textContent='Tracking preference could not be saved.';}});
    clear.addEventListener('click',async()=>{if(!window.confirm('Clear all listening history in this app profile? Your music and playlists will not be deleted.'))return;
        clear.disabled=true;cancelRanks();try{await clearListeningHistory();await render();}catch{status.textContent=storageError||'Could not confirm history deletion.';}finally{clear.disabled=false;checkbox.checked=enabled();}
    });
}
