// Playlist order is stored membership order, independent of library sorting.
const present = v => v != null && String(v) !== '';
export function trackKey(track) {
    if (present(track?.id) && String(track.id).startsWith('local_')) return `local:${track.id}`;
    if (present(track?.tid) && /^[1-9]\d*$/.test(String(track.tid))) return `tid:${track.tid}`;
    if (present(track?.id)) return `id:${track.id}`;
    if (present(track?.fullPath)) return `path:${track.fullPath}`;
    return '';
}
export const isServerPlaylist = id => /^\d+$/.test(String(id));
// Undefined means absent; null marks ambiguous identity. Repeated aliases for the
// same object are harmless. Avoid allocating a Set and intermediate arrays per track.
const reservedKey = /^(local|tid|id|path):/;
function createIdentityIndexBuilder(requested = null) {
    const map = new Map();
    const canonicalOnly = requested !== null && [...requested].every(key => typeof key === 'string' && reservedKey.test(key));
    const put = (key, track) => {
        if (requested && !requested.has(key)) return;
        const prior = map.get(key);
        if (prior === undefined) map.set(key, track);
        else if (prior !== track && prior !== null) map.set(key, null);
    };
    const putLegacy = (value, track) => {
        if (value == null) return;
        const key = String(value);
        if (key && !reservedKey.test(key)) put(key, track);
    };
    const add = track => {
        const key = trackKey(track);
        if (key) put(key, track);
        if (canonicalOnly) return;
        putLegacy(track.id, track);
        putLegacy(track.tid, track);
        putLegacy(track.fullPath, track);
    };
    return {map,add};
}
export function buildPlaylistIndex(library) {
    const builder=createIdentityIndexBuilder();
    for (const track of library) builder.add(track);
    return builder.map;
}
// A view only needs identities referenced by its membership records. Retain
// the exact collision semantics of the full index without retaining unrelated aliases.
export function buildPlaylistLookupIndex(library, keys) {
    const requested = new Set(keys), builder = createIdentityIndexBuilder(requested);
    if (requested.size) for (const track of library) builder.add(track);
    return builder.map;
}
export async function buildPlaylistLookupIndexAsync(library, keys, {isCurrent=()=>true,chunkSize=4096,yieldToHost=yieldSearchTurn}={}) {
    const requested = new Set(keys), builder = createIdentityIndexBuilder(requested);
    const size = Math.max(1, Math.floor(Number(chunkSize)||4096));
    if (requested.size) for (let i=0;i<library.length;i+=size) {
        await yieldToHost();
        if (!isCurrent()) return null;
        for (let j=i;j<Math.min(i+size,library.length);j++) builder.add(library[j]);
    }
    return isCurrent()?builder.map:null;
}
// Canonical-only mutations cannot resolve a key into a different namespace;
// legacy aliases still require the full map to verify their canonical targets.
export function buildPlaylistMutationIndex(library, lookupKeys) {
    const keys = [...new Set(lookupKeys)];
    return keys.every(key=>reservedKey.test(key))?buildPlaylistLookupIndex(library,keys):buildPlaylistIndex(library);
}
// An edit may retain unresolved existing references. Validate only newly added
// references; reordering or renaming canonical members does not require a scan.
// A local legacy alias still needs a fresh full map for lossless migration.
export function preparePlaylistEdit(library, original, submitted, server=false) {
    const old = new Set(original.map(String));
    const added = submitted.map(String).filter(key => !old.has(key));
    const requiresMigration = !server && submitted.some(key => !reservedKey.test(String(key)));
    const index = requiresMigration ? buildPlaylistIndex(library) : buildPlaylistLookupIndex(library, added.map(key => memberLookupKey(key,server)));
    if (added.some(key => !index.get(memberLookupKey(key,server)))) throw Error('A replacement is no longer available.');
    return index;
}
export function memberLookupKey(key, server=false) { return server ? `tid:${key}` : String(key); }
export function resolvePlaylistMembers(keys, library, server=false) {
    const map=library instanceof Map?library:buildPlaylistLookupIndex(library,(keys||[]).map(k=>memberLookupKey(k,server)));
    const result=[], seen=new Set();
    for(const k of keys||[]){const t=map.get(memberLookupKey(k,server));if(t&&!seen.has(t)){seen.add(t);result.push(t);}}
    return result;
}
// Migrate only resolvable legacy members on a successful record write; retain
// ambiguous/missing values verbatim rather than guessing or deleting them.
export function canonicalizeMembership(keys, library) {
    // A namespaced key is either its exact canonical identity or unresolved.
    // Neither outcome changes its stored string; no alias migration is needed.
    if(keys.every(k=>reservedKey.test(String(k))))return keys.map(String);
    const map=library instanceof Map?library:buildPlaylistIndex(library);
    return keys.map(k=>{const t=map.get(String(k));const canonical=trackKey(t);return canonical&&map.get(canonical)===t?canonical:String(k);});
}
export function playlistSummary(playlist, library) {
    const tracks=resolvePlaylistMembers(playlist.tracks,library,isServerPlaylist(playlist.plid)), count=Array.isArray(playlist.tracks)?playlist.tracks.length:Number(playlist.track_count)||0;
    const known=tracks.filter(t=>Number(t.duration)>0&&Number.isFinite(Number(t.duration)));
    const seconds=known.reduce((n,t)=>n+Number(t.duration),0);
    const minutes=Math.floor(seconds/60), duration=seconds<60?`${Math.round(seconds)} sec`:minutes<60?`${minutes} min`:`${Math.floor(minutes/60)} hr ${minutes%60} min`;
    return {tracks,count,missing:Math.max(0,count-tracks.length),text:`${count} ${count===1?'track':'tracks'}${count&&known.length===count?' · '+duration:''}${count>tracks.length?' · '+(count-tracks.length)+' unavailable':''}`};
}
export function moveMember(keys,from,to){const out=keys.slice();if(!Number.isInteger(from)||!Number.isInteger(to)||from<0||to<0||from>=out.length||to>=out.length)return out;out.splice(to,0,out.splice(from,1)[0]);return out;}
export function sameMembership(a,b){const A=new Set(a.map(String)),B=new Set(b.map(String));return a.length===b.length&&A.size===a.length&&B.size===b.length&&a.every(x=>B.has(String(x)));}
export function shuffleMembers(items,random=Math.random){const out=items.slice();for(let i=out.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[out[i],out[j]]=[out[j],out[i]];}return out;}

// A replacement is explicit, unambiguous and cannot duplicate a resolved member.
export function replacementMember(keys, position, track, index, server=false) {
    const key=trackKey(track);
    if(!Number.isInteger(position)||position<0||position>=keys.length||!key||index.get(key)!==track|| (server&&!/^tid:[1-9]\d*$/.test(key))) return null;
    if(index.get(memberLookupKey(keys[position],server)))return null;
    const value=server?String(track.tid):key;
    if(keys.some((k,i)=>i!==position&&(String(k)===value||index.get(memberLookupKey(k,server))===track)))return null;
    const result=keys.slice();result[position]=value;return result;
}
// Conservative three-way rebase: disjoint fields merge, simultaneous divergent
// order/membership changes require review. Never silently discard remote members.
export function rebasePlaylistDraft(base, draft, latest) {
    const conflicts=[];const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
    const merge=(field,a,b,c)=>{if(equal(b,a))return c;if(equal(c,a)||equal(b,c))return b;conflicts.push(field);return b;};
    const name=merge('name',base.name,draft.name,latest.name);
    const tracks=merge('track order or membership',base.tracks.map(String),draft.tracks.map(String),latest.tracks.map(String));
    return {name,tracks,conflicts};
}
// A picker uses a deliberate catalog snapshot for browsing; mutations always
// re-resolve against the current catalog. Paging/review never rebuilds the index.
export function createPlaylistPickerIndex(library, searchText) {
    const tracks=library.slice();
    return pickerCatalog(tracks,buildPlaylistIndex(tracks),searchText);
}
// Yield between bounded chunks. A cancelled or superseded modal never receives
// a partial index; mutating operations still rebuild a fresh authoritative index.
export async function createPlaylistPickerIndexAsync(library,searchText,{isCurrent=()=>true,chunkSize=4096,yieldToHost=()=>new Promise(resolve=>setTimeout(resolve,0))}={}) {
    const tracks=library.slice(),builder=createIdentityIndexBuilder();
    const size=Math.max(1,Math.floor(Number(chunkSize)||4096));
    for(let start=0;start<tracks.length;start+=size){
        await yieldToHost();
        if(!isCurrent())return null;
        for(let i=start;i<Math.min(start+size,tracks.length);i++)builder.add(tracks[i]);
    }
    return isCurrent()?pickerCatalog(tracks,builder.map,searchText):null;
}
// Prefer the browser's cooperative task scheduler when available; older
// WebViews use the existing timer fallback. No workers or persistent timers.
function yieldSearchTurn(){
    if(typeof globalThis.scheduler?.yield==='function')return globalThis.scheduler.yield();
    return new Promise(resolve=>setTimeout(resolve,0));
}
// Cooperative filter: no incomplete result is published. A time budget plus a
// record ceiling limits each turn; the ceiling also works with coarse clocks.
export async function searchPlaylistTracksAsync(tracks,query,textAt,{
    isCurrent=()=>true,yieldToHost=yieldSearchTurn,
    chunkSize=2048,budgetMs=6,now=()=>performance.now()
}={}) {
    const normalized=String(query||'').trim().toLowerCase();
    if(!isCurrent())return null;
    if(!normalized)return tracks;
    const terms=normalized.split(/\s+/),result=[];
    const ceiling=Math.max(1,Math.floor(Number(chunkSize)||2048));
    let i=0;
    while(i<tracks.length){
        await yieldToHost();
        if(!isCurrent())return null;
        const started=now(),end=Math.min(i+ceiling,tracks.length);
        for(;i<end;){
            const text=textAt(tracks[i],i);
            if(terms.every(term=>text.includes(term)))result.push(tracks[i]);
            i++;
            if(i%32===0&&now()-started>=budgetMs)break;
        }
    }
    return isCurrent()?result:null;
}
function pickerCatalog(tracks,index,searchText){
    // Lazily cache each normalized text once, including across cancelled searches.
    // The cache belongs to this modal snapshot, not the global library.
    const text=[];let lastQuery='',lastResults=tracks;
    const normalize=q=>String(q||'').trim().toLowerCase();
    const textAt=(track,i)=>text[i]??(text[i]=searchText(track));
    const publish=(query,result)=>{lastQuery=query;lastResults=result;return result;};
    return {tracks,index,search(query){const normalized=normalize(query);if(normalized===lastQuery)return lastResults;if(!normalized)return publish('',tracks);
        const terms=normalized.split(/\s+/);return publish(normalized,tracks.filter((track,i)=>terms.every(term=>textAt(track,i).includes(term))));},
        async searchAsync(query,options={}){
            const current=options.isCurrent||(()=>true),normalized=normalize(query);
            if(!current())return null;
            if(normalized===lastQuery)return lastResults;
            const result=await searchPlaylistTracksAsync(tracks,normalized,textAt,options);
            return result&&current()?publish(normalized,result):null;
        }};
}
export function classifyPlaylistSelection(selected, playlist, library) {
    const server=isServerPlaylist(playlist.plid),index=library instanceof Map?library:buildPlaylistIndex(library),members=new Set(resolvePlaylistMembers(playlist.tracks,index,server));
    const valid=[],already=[],unavailable=[],unsupported=[];
    for(const [key] of selected){const track=index.get(key);if(!track){unavailable.push(key);continue;}if(server&&!/^tid:[1-9]\d*$/.test(key)){unsupported.push(key);continue;}if(members.has(track)){already.push(key);continue;}valid.push([key,track]);}
    return {valid,already,unavailable,unsupported};
}
