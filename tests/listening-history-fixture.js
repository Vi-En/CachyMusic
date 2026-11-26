(()=>{
 const values=new Map();Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)}});
 const stores=Object.fromEntries(['days','totals','visits','meta'].map(n=>[n,new Map()]));window.historyRows=stores.days;window.historyStores=stores;
 window.IDBKeyRange={bound:(lo,hi)=>({lo,hi})};
 const db={close(){},transaction(names){let pending=0,done=false,aborted=false;
 const tx={abort(){if(done)throw Error('done');aborted=true;done=true;tx.onabort?.();},objectStore(name){const rows=stores[name];if(!rows)throw Error(name);const keyOf=v=>name==='days'?[v.day,v.key]:name==='visits'?v.id:v.key;
 const request=(fn)=>{const r={};pending++;queueMicrotask(()=>{if(!aborted){r.result=fn();r.onsuccess?.();}pending--;});return r;};
 return {get:key=>request(()=>rows.get(JSON.stringify(key))),put:v=>request(()=>rows.set(JSON.stringify(keyOf(v)),structuredClone(v))),add:v=>request(()=>{if(rows.has(JSON.stringify(keyOf(v))))throw Error('duplicate');rows.set(JSON.stringify(keyOf(v)),structuredClone(v));}),clear:()=>request(()=>rows.clear()),openCursor(range){const list=[...rows.values()].filter(v=>!range||(v.day>=range.lo[0]&&v.day<=range.hi[0]));let i=0;const r={};pending++;const advance=()=>{if(aborted)return;r.result=i<list.length?{value:list[i++],continue:()=>queueMicrotask(advance)}:null;r.onsuccess?.();if(!r.result)pending--;};queueMicrotask(advance);return r;}};}};
 const poll=()=>{if(done)return;if(!pending){done=true;tx.oncomplete?.();}else setTimeout(poll,1);};setTimeout(poll,1);return tx;}};
 Object.defineProperty(window,'indexedDB',{configurable:true,value:{open(){const r={result:db};queueMicrotask(()=>r.onsuccess());return r;}}});
})();
