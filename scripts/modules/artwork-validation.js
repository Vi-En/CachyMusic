import { MAX_ART } from './metadata-providers.js';
// Preflight dimensions before asking a browser image decoder to allocate pixels.
export function imageInfo(b) {
    const v = new DataView(b.buffer,b.byteOffset,b.byteLength), ascii=(p,n)=>String.fromCharCode(...b.subarray(p,p+n));
    if (b.length>=24 && ascii(0,8)==='\x89PNG\r\n\x1a\n' && ascii(12,4)==='IHDR') return {mime:'image/png',width:v.getUint32(16),height:v.getUint32(20)};
    if (b.length>=30 && ascii(0,4)==='RIFF' && ascii(8,4)==='WEBP') {
        if (ascii(12,4)==='VP8X') return {mime:'image/webp',width:1+b[24]+b[25]*256+b[26]*65536,height:1+b[27]+b[28]*256+b[29]*65536};
        if (ascii(12,4)==='VP8 ' && b[23]===157 && b[24]===1 && b[25]===42) return {mime:'image/webp',width:v.getUint16(26,true)&16383,height:v.getUint16(28,true)&16383};
        if (ascii(12,4)==='VP8L' && b[20]===47) {const x=v.getUint32(21,true);return {mime:'image/webp',width:1+(x&16383),height:1+((x>>>14)&16383)};}
    }
    if (b.length>=4 && b[0]===255 && b[1]===216) {
        let p=2;
        while(p+4<=b.length && b[p]===255) {
            while(p<b.length && b[p]===255) p++;
            const m=b[p++]; if(m===217||m===218) break;
            if(m===1 || (m>=208&&m<=215)) continue;
            if(p+2>b.length) break;
            const n=v.getUint16(p); if(n<2||p+n>b.length) break;
            if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(m) && n>=8) return {mime:'image/jpeg',height:v.getUint16(p+3),width:v.getUint16(p+5)};
            p+=n;
        }
    }
    throw new Error('Unsupported or malformed artwork. Use PNG, JPEG or WebP.');
}
export function validateImageBytes(b) {
    if (!b.length || b.length>MAX_ART) throw new Error('Artwork must be under 10 MB.');
    const info=imageInfo(b);
    if(!info.width||!info.height||info.width>8192||info.height>8192||info.width*info.height>16000000) throw new Error('Artwork exceeds the safe pixel limit (16 megapixels).');
    return info;
}
export async function prepareArtwork(blob) {
    if (!(blob instanceof Blob) || blob.size>MAX_ART || !blob.size) throw new Error('Artwork must be under 10 MB.');
    const b=new Uint8Array(await blob.arrayBuffer()), info=validateImageBytes(b);
    const bitmap=await createImageBitmap(new Blob([b],{type:info.mime}));
    try {
        if(bitmap.width*bitmap.height>16000000) throw new Error('Decoded artwork exceeds the safe pixel limit.');
        const scale=Math.min(1,2048/Math.max(bitmap.width,bitmap.height));
        const canvas=document.createElement('canvas'); canvas.width=Math.max(1,Math.round(bitmap.width*scale)); canvas.height=Math.max(1,Math.round(bitmap.height*scale));
        canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
        const output=await new Promise(resolve=>canvas.toBlob(resolve, info.mime==='image/jpeg'?'image/jpeg':'image/png',.94));
        if(!output||output.size>MAX_ART) throw new Error('Processed artwork exceeds the size limit.');
        const dataUrl=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(output);});
        return {dataUrl,width:canvas.width,height:canvas.height};
    } finally { bitmap.close(); }
}
