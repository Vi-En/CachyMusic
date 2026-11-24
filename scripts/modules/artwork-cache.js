import { validateImageBytes } from './artwork-validation.js';
// Bounded cache, shared across album tracks. Original file and embedded art remain intact.
const cache = new Map();
const pending = new Map();
const MAX_ENTRIES = 48;
// Count encoded characters as a portable upper bound on retained cover data.
// JS engines may store strings in one or two bytes per character.
const MAX_CACHED_CHARS = 8 * 1024 * 1024;
let cacheChars = 0;
const MAX_ACTIVE_BITMAPS = 2;
let activeBitmaps = 0;
const decodeQueue = [];
async function withBitmapBudget(task) {
    // Transfer an existing permit to the next waiter without a new caller stealing it.
    if (activeBitmaps >= MAX_ACTIVE_BITMAPS) await new Promise(resolve => decodeQueue.push(resolve));
    else activeBitmaps++;
    try { return await task(); }
    finally {
        const next = decodeQueue.shift();
        if (next) next();
        else activeBitmaps--;
    }
}
function cachedSize(value) { return value.cover.length + value.coverThumb.length; }
function remember(hash, value) {
    const cost = cachedSize(value);
    if (cost > MAX_CACHED_CHARS) return;
    if (cache.has(hash)) cacheChars -= cachedSize(cache.get(hash));
    cache.delete(hash);
    cache.set(hash, value);
    cacheChars += cost;
    while (cache.size > MAX_ENTRIES || cacheChars > MAX_CACHED_CHARS) {
        const oldest = cache.keys().next().value;
        cacheChars -= cachedSize(cache.get(oldest));
        cache.delete(oldest);
    }
}
async function thumbnail(cover) {
    const match=/^data:image\/(?:png|jpeg|jpg|webp);base64,([A-Za-z0-9+/=]+)$/i.exec(cover);
    if(!match || match[1].length>14_000_000) return null;
    const bytes=Uint8Array.from(atob(match[1]),c=>c.charCodeAt(0));
    validateImageBytes(bytes);
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
    if (cache.has(hash)) {
        const hit = cache.get(hash);
        cache.delete(hash);
        cache.set(hash, hit);
        return hit;
    }
    if (pending.has(hash)) return pending.get(hash);
    const task = makeThumbnails(bytes, hash);
    pending.set(hash, task);
    try { return await task; }
    finally { pending.delete(hash); }
}
async function makeThumbnails(bytes, hash) {
    return withBitmapBudget(async () => {
    const bmp=await createImageBitmap(new Blob([bytes]));
    try {
        const make=async(max)=>{const ratio=Math.min(1,max/Math.max(bmp.width,bmp.height));
            const c=typeof OffscreenCanvas==='function'?new OffscreenCanvas(Math.max(1,Math.round(bmp.width*ratio)),Math.max(1,Math.round(bmp.height*ratio))):Object.assign(document.createElement('canvas'),{width:Math.max(1,Math.round(bmp.width*ratio)),height:Math.max(1,Math.round(bmp.height*ratio))});
            c.getContext('2d').drawImage(bmp,0,0,c.width,c.height);
            const out=typeof c.convertToBlob==='function'?await c.convertToBlob({type:'image/webp',quality:.87}):await new Promise(r=>c.toBlob(r,'image/webp',.87));
            if(!out)throw Error('Thumbnail unavailable');
            const ab=new Uint8Array(await out.arrayBuffer());let base='';for(let i=0;i<ab.length;i+=8192)base+=String.fromCharCode(...ab.subarray(i,i+8192));return `data:${out.type};base64,${btoa(base)}`;
        };
        const result={coverKey:hash,coverThumb:await make(96),cover:await make(768)};
        remember(hash, result);return result;
    } finally {bmp.close();}
    });
}
export async function optimizeTrackArtwork(meta) {
    if(typeof meta.cover!=='string'||!meta.cover.startsWith('data:'))return meta;
    try {const result=await thumbnail(meta.cover);return result?{...meta,...result}:{...meta,cover:null,coverThumb:null};}
    catch {
        // If thumbnail generation is unsupported, retain a preflight-valid original cover.
        try {const payload=meta.cover.split(',')[1];if(!payload||payload.length>14_000_000)throw Error();validateImageBytes(Uint8Array.from(atob(payload),c=>c.charCodeAt(0)));return meta;}catch{return {...meta,cover:null,coverThumb:null};}
    }
}
