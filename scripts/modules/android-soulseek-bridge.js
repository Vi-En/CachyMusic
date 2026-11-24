// SPDX-License-Identifier: GPL-3.0-or-later
// Asynchronous native bridge: only small bounded RPC messages, never remote URLs.
export class AndroidSoulseekBridge {
    constructor(native, {timeout=18000, maxPending=32, idPrefix=globalThis.crypto?.randomUUID?.()||String(Date.now())}={}){
        this.native=native;this.timeout=timeout;this.maxPending=maxPending;this.prefix=idPrefix;this.sequence=0;this.pending=new Map();
    }
    request(action,body,query){
        if(this.pending.size>=this.maxPending)return Promise.reject(Error('Soulseek bridge busy'));
        const id=`${this.prefix}-${++this.sequence}`;
        return new Promise((resolve,reject)=>{
            const timeout=setTimeout(()=>{this.pending.delete(id);reject(Error('Soulseek request timed out'));},this.timeout);
            this.pending.set(id,{resolve,reject,timeout});
            try{if(!this.native.enqueueSoulseekApi(id,action,body,query))throw Error('Soulseek bridge busy or invalid request');}
            catch(e){clearTimeout(timeout);this.pending.delete(id);reject(e);}
        });
    }
    accept(id,result){
        const job=this.pending.get(id);if(!job)return false;
        this.pending.delete(id);clearTimeout(job.timeout);
        if(typeof result!=='string'||result.length>2*1024*1024){job.reject(Error('Invalid Soulseek response'));return false;}
        try{JSON.parse(result);job.resolve(result);return true;}catch(e){job.reject(Error('Invalid Soulseek JSON'));return false;}
    }
    close(){for(const job of this.pending.values()){clearTimeout(job.timeout);job.reject(Error('Soulseek bridge closed'));}this.pending.clear();}
}
