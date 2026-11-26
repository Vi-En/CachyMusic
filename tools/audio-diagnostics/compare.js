'use strict';
const $=id=>document.getElementById(id);
let file=null,owner=null,epoch=0,previousClose=Promise.resolve();
const observations={plain:null,graph:null};
function text(id,v){$(id).textContent=String(v);}
function updateButtons(){for(const id of ['plain','graph'])$(id).disabled=!file;$('stop').disabled=!owner;}
function stop(reason='Stopped.'){++epoch;const old=owner;owner=null;updateButtons();if(old){old.media.pause();old.media.removeAttribute('src');old.media.load();if(old.source)old.source.disconnect();if(old.gain)old.gain.disconnect();URL.revokeObjectURL(old.url);if(old.context&&old.context.state!=='closed')previousClose=old.context.close().catch(()=>{});}
    text('status',reason);text('route','—');text('graphState','—');text('rate','—');text('actualVolume','—');}
function requested(){return Number($('volume').value)/100;}
function updateVolume(){const v=requested();text('level',`${Math.round(v*100)}%`);if(owner){owner.media.volume=v;text('actualVolume',`${v.toFixed(2)} / ${owner.media.volume.toFixed(2)}`);}}
$('volume').addEventListener('input',updateVolume);
$('file').addEventListener('change',()=>{stop();file=$('file').files[0]||null;observations.plain=observations.graph=null;$('plainResult').selectedIndex=$('graphResult').selectedIndex=0;text('fileState',file?'Local file ready.':'No file selected.');updateButtons();});
async function start(kind){if(!file)return;stop();const request=epoch;await previousClose;if(request!==epoch||!file)return;
    const media=document.createElement('audio'),url=URL.createObjectURL(file);const current={media,url,source:null,gain:null,context:null};owner=current;updateButtons();
    try{media.src=url;media.volume=requested();media.playbackRate=1;const info={requestedVolume:requested(),mediaVolume:null,contextRate:null,contextState:null,result:'starting'};
        if(kind==='graph'){const C=window.AudioContext||window.webkitAudioContext;if(!C)throw Error('Web Audio unavailable');const ctx=current.context=new C({latencyHint:'playback'});const src=current.source=ctx.createMediaElementSource(media),gain=current.gain=ctx.createGain();gain.gain.value=1;src.connect(gain).connect(ctx.destination);
            // This is a direct graph with a unity output gate, no DSP.
            await ctx.resume();if(request!==epoch)return;if(ctx.state!=='running')throw Error('Audio context not running');info.contextRate=ctx.sampleRate;info.contextState=ctx.state;}
        await media.play();if(request!==epoch){media.pause();return;}info.mediaVolume=media.volume;info.result='playing';observations[kind]=info;
        text('status','Playing. Listen at low physical volume. Stop immediately if distorted.');text('route',kind==='plain'?'Regular media':'Direct Web Audio');text('graphState',info.contextState||'No Web Audio graph');text('rate',info.contextRate?`${info.contextRate} Hz`:'Not reported');updateVolume();
        media.addEventListener('ended',()=>{if(owner===current)stop('Reference playback finished.');},{once:true});media.addEventListener('error',()=>{if(owner===current){observations[kind]={...info,result:'media-error',code:media.error?.code||0};stop('Media decode or playback error.');}},{once:true});
    }catch(error){if(request!==epoch)return;observations[kind]={result:'failed'};stop('Could not start the selected route. Check browser and device output.');}}
$('plain').addEventListener('click',()=>void start('plain'));$('graph').addEventListener('click',()=>void start('graph'));$('stop').addEventListener('click',()=>stop());
window.addEventListener('pagehide',()=>stop());
$('export').addEventListener('click',()=>{const report={schema:1,scope:'independent route comparison; physical output not automatically verified',regularMedia:{$result:$('plainResult').value,observation:observations.plain},directGraph:{$result:$('graphResult').value,observation:observations.graph}};const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='audio-route-comparison.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
