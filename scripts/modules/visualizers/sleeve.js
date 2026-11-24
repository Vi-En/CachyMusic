import { circle, ring, bandLevel, label, drawDial, createDock } from './record-dial.js';
// Warm printed paper label and a terracotta, audio-responsive groove.
export function drawCore(ctx,w,h,playing,now,dt,beat,snare,bass,mid,treble,fidelity,bands){
    drawDial(ctx,w,h,c=>{
        circle(c,.987,'#352820','#b4a18d',.009);
        for(let r=.92;r>.53;r-=.031)ring(c,r,'#6a5141',.005);
        c.strokeStyle='#d2a785';c.lineWidth=.012;c.beginPath();
        for(let i=0;i<=64;i++){
            const a=i*Math.PI*2/64;
            const r=.68+.15*bandLevel(bands,i%64,64,playing,bass);
            const x=Math.cos(a)*r,y=Math.sin(a)*r;i?c.lineTo(x,y):c.moveTo(x,y);
        }c.closePath();c.stroke();
        circle(c,.49,'#f0e4ce','#bba184',.012);ring(c,.42,'#ac7958',.007);
        label(c,'Sleeve',-.12,'#412e23',.15,'Georgia, serif');
        circle(c,.044,'#412e23');label(c,'CachyMusic',.16,'#6e4f3c',.071,'Georgia, serif');
    });
}
export const drawDockScene=createDock(drawCore);
