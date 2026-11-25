// Keep the output gate independent of the chosen processing route. A newly
// constructed graph inherits an active hold before any source is connected.
export function createOutputHold(readGraph, {rampSeconds=.018, timeoutMs=300, sleep=ms=>new Promise(r=>setTimeout(r,ms))}={}) {
    let held=false;
    function ramp(target, seconds) {
        const {ctx,node}=readGraph();
        if (!ctx || ctx.state==='closed') return null;
        if(!node || node.context && node.context!==ctx)throw Error('Audio output gate unavailable');
        const now=ctx.currentTime, gain=node.gain;
        if (typeof gain.cancelAndHoldAtTime==='function') gain.cancelAndHoldAtTime(now);
        else { const value=gain.value; gain.cancelScheduledValues(now); gain.setValueAtTime(value,now); }
        if (ctx.state!=='running'||seconds===0) { gain.setValueAtTime(target,now); return null; }
        gain.linearRampToValueAtTime(target,now+seconds);
        return {ctx,end:now+seconds};
    }
    return {
        get held(){return held;},
        async acquire(){
            held=true;
            const transition=ramp(0,rampSeconds);
            if (!transition) return;
            const start=Date.now();
            while(transition.ctx.state==='running' && transition.ctx.currentTime<transition.end){
                if(Date.now()-start>=timeoutMs){ramp(0,0);throw Error('Audio output did not reach silence');}
                await sleep(4);
            }
            if(transition.ctx.state!=='running')ramp(0,0);
        },
        release(){ramp(1,rampSeconds);held=false;},
        // Called before connecting a replacement graph.
        initialize(node){node.gain.value=held?0:1;}
    };
}
