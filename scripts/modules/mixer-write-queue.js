// Only one native/HTTP mixer write may be in flight. A newer request replaces
// the waiting value, not the already-dispatched side effect. Backend changes
// wait for the dispatched operation before accepting a new mode.
export function createMixerWriteQueue({write,enabled,report=()=>{},modeTimeout=2000}) {
    let pending=null, flight=null, generation=0;
    function start(){
        if(flight||!pending)return;
        flight=Promise.resolve().then(async()=>{
            while(pending){
                const job=pending;pending=null;
                if(job.generation!==generation||!enabled())continue;
                try { await write(job.value); }
                catch(error){ if(job.generation===generation&&enabled()&&!pending)report(error); }
            }
        }).finally(()=>{flight=null;if(pending)start();});
    }
    return {
        submit(value){pending={value,generation};start();},
        get busy(){return Boolean(flight||pending);},
        async invalidate(){
            generation++;pending=null;
            if(!flight)return;
            let timer;
            try { await Promise.race([flight,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Mixer write still in progress')),modeTimeout);})]); }
            finally {clearTimeout(timer);}
        },
        async drain(){while(flight)await flight;}
    };
}
