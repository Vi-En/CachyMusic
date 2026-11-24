import { circle, ring, bandLevel, drawDial, createDock } from './record-dial.js';
// A dark, segmented instrument meter rather than another recoloured record.
export function drawCore(ctx,w,h,playing,now,dt,beat,snare,bass,mid,treble,fidelity,bands) {
    drawDial(ctx,w,h,c=>{
        circle(c,.987,'#1b1c1d','#626467',.008);
        ring(c,.9,'#383a3c',.006); ring(c,.83,'#424446',.004);
        for(let i=0;i<16;i++){
            const level=bandLevel(bands,i,16,playing,mid);const x=-.62+i*.083;
            for(let j=0;j<9;j++){
                c.fillStyle=j<Math.round(level*9)?'#dce0df':'#323538';
                c.fillRect(x,-.33+(8-j)*.074,.062,.051);
            }
        }
        ring(c,.65,'#696d6e',.009,Math.PI*.24,Math.PI*.76);
        c.fillStyle='#b2b7b8';c.font='500 .075px system-ui';c.textAlign='center';c.fillText('GRAPHITE',0,-.56);
        circle(c,.035,'#a6a9a9');
    });
}
export const drawDockScene=createDock(drawCore);
