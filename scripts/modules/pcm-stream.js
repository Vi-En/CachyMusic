// SPDX-License-Identifier: GPL-3.0-or-later
// Bounded source scheduler. PCM conversion/resampling happens in a dedicated worker.
export class PcmStream {
    constructor(context,destination,file,format,{onStart,onEnd,onError,onProgress}){
        this.ctx=context;this.destination=destination;this.file=file;this.format=format;
        this.onStart=onStart;this.onEnd=onEnd;this.onError=onError;this.onProgress=onProgress;
        this.nodes=new Set();this.requests=new Map();this.sequence=0;this.closed=false;this.started=false;
    }
    async prepare(seconds, quickStart=false){
        if(this.closed||this.worker)throw Error("Stream cannot be prepared twice");
        this.worker=new Worker(new URL('./pcm-worker.js',import.meta.url),{type:'module'});
        this.worker.onmessage=({data})=>{const job=this.requests.get(data.id);if(!job)return;this.requests.delete(data.id);clearTimeout(job.timeout);data.error?job.reject(Error(data.error)):job.resolve(data);};
        this.worker.onerror=()=>this.fail(Error('PCM decoding worker failed'));
        const {frames}=await this.request({type:'init',file:this.file,format:this.format,rate:this.ctx.sampleRate});
        if(this.closed)return;
        this.first=Math.min(frames,Math.max(0,Math.floor(seconds*this.ctx.sampleRate)));this.cursor=this.first;this.frames=frames;
        this.chunk=Math.max(128,Math.round(this.ctx.sampleRate/5));
        // Fill before setting the actual start clock, so a slow first read is not an underrun.
        const ready=[];let buffered=0;
        if(quickStart && this.cursor<frames){
            let responsive=true;
            // The cached prefix can make the first read look faster than the following reads.
            for(let i=0;i<2 && this.cursor<frames;i++){
                const begin=performance.now(),channels=await this.read();
                if(this.closed)return;
                ready.push(channels);buffered+=channels[0].length;
                responsive=responsive && performance.now()-begin<1000*channels[0].length/this.ctx.sampleRate*0.45;
            }
            this.fastStart=responsive && (ready.length===2 || this.cursor===frames);
        }
        const target=this.ctx.sampleRate*(this.fastStart?0.4:0.6);
        while(this.cursor<frames && buffered<target){const ch=await this.read();if(this.closed)return;ready.push(ch);buffered+=ch[0].length;}
        if(this.closed)return;
        this.ready=ready;
    }
    async start(seconds, quickStart=false){await this.prepare(seconds,quickStart);if(!this.closed)this.startPrepared(this.ctx.currentTime+(quickStart?0.035:0.12));}
    get endTime(){return this.started?this.anchor+(this.frames-this.first)/this.ctx.sampleRate:NaN;}
    startPrepared(when,{notify=true}={}){
        if(this.closed||this.started||!this.ready||!Number.isFinite(when)||when<=this.ctx.currentTime)throw Error('Invalid PCM start clock');
        this.anchor=this.nextTime=when;this.scheduledFrames=0;
        for(const ch of this.ready)this.schedule(ch);
        this.ready=null;this.started=true;
        if(notify)this.onStart(this.anchor,this.first/this.ctx.sampleRate);
        this.timer=setInterval(()=>this.pump(),80);this.pump();
    }
    request(data){if(this.closed)return Promise.reject(Error('Stream stopped'));return new Promise((resolve,reject)=>{const id=++this.sequence;const timeout=setTimeout(()=>{this.requests.delete(id);reject(Error("PCM worker request timed out"));},5000);this.requests.set(id,{resolve,reject,timeout});try{this.worker.postMessage({...data,id});}catch(e){clearTimeout(timeout);this.requests.delete(id);reject(e);}});}
    async read(){const count=Math.min(this.chunk,this.frames-this.cursor);const {channels}=await this.request({type:'read',first:this.cursor,count});if(!channels?.[0]||channels[0].length!==count)throw Error('Invalid PCM worker response');this.cursor+=count;return channels;}
    schedule(ch){
        const n=ch[0].length;if(!n)return;
        const b=this.ctx.createBuffer(ch.length,n,this.ctx.sampleRate);for(let c=0;c<ch.length;c++)b.copyToChannel(ch[c],c);
        const source=this.ctx.createBufferSource();source.buffer=b;source.connect(this.destination);this.nodes.add(source);
        source.onended=()=>{this.nodes.delete(source);source.disconnect();};source.start(this.nextTime);this.scheduledFrames+=n;this.nextTime=this.anchor+this.scheduledFrames/this.ctx.sampleRate;
    }
    async pump(){
        if(this.closed||!this.started||this.pumping)return;this.pumping=true;
        try{
            this.onProgress?.(this);
            if(this.ctx.currentTime>=this.nextTime){if(this.cursor>=this.frames){this.stop();this.onEnd();return;}throw Error('PCM streaming underrun. Resume to retry.');}
            while(!this.closed&&this.cursor<this.frames&&this.nextTime-this.ctx.currentTime<0.8){
                const ch=await this.read();if(this.closed)return;if(this.ctx.currentTime>=this.nextTime)throw Error('PCM streaming underrun. Resume to retry.');this.schedule(ch);
            }
            if(!this.closed)this.onProgress?.(this);
        }catch(e){this.fail(e);}finally{this.pumping=false;}
    }
    position(){return this.started?Math.min(this.format.duration,this.first/this.ctx.sampleRate+Math.max(0,Math.min(this.nextTime,this.ctx.currentTime)-this.anchor)):0;}
    fail(error){if(this.closed)return;const position=this.position();this.stop();this.onError(error,position);}
    stop(){if(this.closed)return;this.closed=true;this.ready=null;clearInterval(this.timer);this.worker?.terminate();for(const job of this.requests.values()){clearTimeout(job.timeout);job.reject(Error('Stream stopped'));}this.requests.clear();for(const source of this.nodes){source.onended=null;try{source.stop();source.disconnect();}catch(_){}}this.nodes.clear();}
}
