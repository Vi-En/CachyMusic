// One acknowledgement channel per real worklet node; no per-message listeners.
export function createWorkletAcknowledgements({timeout=700}={}) {
    const channels=new WeakMap();
    let sequence=0;
    function settle(channel,error){
        for(const item of channel.waiters){clearTimeout(item.timer);error?item.reject(error):item.resolve();}
        channel.waiters.clear();
    }
    return {
        register(node){
            if(channels.has(node))throw Error("DSP processor already registered");
            channels.set(node,{sent:0,received:0,waiters:new Set()});
        },
        send(node,params){
            const channel=channels.get(node);
            if(!channel)throw Error("DSP processor not registered");
            const revision=++sequence,previous=channel.sent;
            channel.sent=revision;
            try { node.port.postMessage({...params,revision}); }
            catch(error){channel.sent=previous;throw error;}
        },
        receive(node,data){
            const channel=channels.get(node);
            if(!channel||data?.type!=='status'||!Number.isSafeInteger(data.revision)||data.revision<=0||data.revision>channel.sent)return;
            channel.received=Math.max(channel.received,data.revision);
            // Waiters follow the latest committed send, with their original deadline.
            if(channel.received>=channel.sent)settle(channel);
        },
        pending(node){const c=channels.get(node);return !!node&&(!c||c.sent===0||c.received<c.sent);},
        wait(node){
            const c=channels.get(node);
            if(!c)return Promise.reject(Error("DSP processor not registered or replaced"));
            if(c.sent===0)return Promise.reject(Error("DSP parameters not sent"));
            if(c.received>=c.sent)return Promise.resolve();
            return new Promise((resolve,reject)=>{
                const item={resolve,reject,timer:null};
                item.timer=setTimeout(()=>{c.waiters.delete(item);reject(Error('DSP parameter acknowledgement timed out'));},timeout);
                c.waiters.add(item);
            });
        },
        close(node){const c=channels.get(node);if(c)settle(c,Error('DSP processor replaced'));channels.delete(node);}
    };
}
