// Preserve read-your-writes semantics when a browser denies access or exceeds quota.
// An override is needed only while a write to the preferred durable tier fails.
// Storage remains best effort across reloads; session and memory are not durability.
export function createPreferenceStorage({local,session}={}) {
    const overrides=new Map();
    const tiers=[local,session];
    function mutate(method,key,value) {
        const ok=tiers.map(get=>{
            try {const storage=get?.();if(!storage)return false;storage[method](key,...(method==='setItem'?[value]:[]));return true;}
            catch {return false;}
        });
        // A failed secondary deletion can resurrect a value when local returns null.
        if(ok[0]&&(method==='setItem'||ok[1]))overrides.delete(key);
        else overrides.set(key,method==='setItem'?value:null);
        return ok[0]?'local':ok[1]?'session':'memory';
    }
    return {
        getItem(key){
            key=String(key);
            if(overrides.has(key))return overrides.get(key);
            for(const get of tiers){try{const v=get?.()?.getItem(key);if(v!=null)return v;}catch{}}
            return null;
        },
        setItem(key,value){return mutate('setItem',String(key),String(value));},
        removeItem(key){return mutate('removeItem',String(key));}
    };
}
