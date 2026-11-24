import { circle, ring, radialBars, drawDial, createDock } from './record-dial.js';
// True-black dial with a single illuminated spectral ring.
export function drawCore(ctx,w,h,playing,now,dt,beat,snare,bass,mid,treble,fidelity,bands){
    drawDial(ctx,w,h,c=>{
        circle(c,.987,'#000','#263841',.006);
        ring(c,.85,'#22333d',.005);
        radialBars(c,bands,playing,90,.54,.28,'#80d6ee',treble,.008);
        ring(c,.47,'#203b46',.006);
        ring(c,.35,'#8bd9ec',.012,-Math.PI/2,-Math.PI/2+Math.PI*(playing?.25+1.4*bass:.18));
        circle(c,.035,'#8bd9ec');
    });
}
export const drawDockScene=createDock(drawCore);
