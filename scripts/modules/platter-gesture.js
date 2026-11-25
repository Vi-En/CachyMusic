// A single touch owns a swipe. Additional fingers or cancellation invalidate it.
export function bindPlatterSwipe(element,{next,previous,clock=()=>performance.now()}={}){
    let start=null;
    const reset=()=>{start=null;};
    const begin=e=>{
        if(e.touches.length!==1){reset();return;}
        const t=e.touches[0];start={id:t.identifier,x:t.clientX,y:t.clientY,time:clock()};
    };
    const move=e=>{if(e.touches.length!==1||e.touches[0].identifier!==start?.id)reset();};
    const end=e=>{
        const owner=start;reset();if(!owner||e.touches.length||e.changedTouches.length!==1)return;
        const t=e.changedTouches[0];if(t.identifier!==owner.id)return;
        const dx=t.clientX-owner.x,dy=t.clientY-owner.y;
        if(Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy)*1.4&&clock()-owner.time<600){if(dx<0)next();else previous();}
    };
    const handlers={touchstart:begin,touchmove:move,touchend:end,touchcancel:reset};
    for(const [event,fn] of Object.entries(handlers))element.addEventListener(event,fn,{passive:true});
    return ()=>{reset();for(const [event,fn] of Object.entries(handlers))element.removeEventListener(event,fn);};
}
