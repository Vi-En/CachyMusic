// App-owned alternative to the OEM-controlled notification. No audio routing,
// permission, background worker or timer is created until the card is opened.
import {store} from './state.js';
import {mediaSessionController} from './media-session.js';
import {formatTime,pushModalState,popModalState} from './utils.js';
let initialized=false;
export function initCompactMedia(){
    if(initialized)return;initialized=true;
    const by=id=>document.getElementById(id), dialog=by('compactMediaDialog'),trigger=by('compactMediaBtn');
    if(!dialog||!trigger)return;
    const canvas=by('compactMediaWave'), ctx=canvas.getContext('2d'), art=by('compactMediaArt'), seek=by('compactMediaSeek'), play=by('compactMediaPlay'), status=by('compactMediaWaveStatus');
    const reduced=matchMedia('(prefers-reduced-motion: reduce)');let timer=0,samples=null,cover='',scrubbing=false,scrubTrack=null,lastTrack=null,returnFocus=null,scrubCancelled=false,semanticTick=0,wasDrawing=false;
    function setText(id,value){const e=by(id);if(e.textContent!==value)e.textContent=value;}
    function update(){
        const s=store.state,track=s.isStandalonePlayback?s.standaloneTrackList?.[s.standaloneTrackIndex]:s.allTracks?.[s.currentTrackIndex];
        setText('compactMediaTitle',track?.title||track?.filename||'No track loaded');setText('compactMediaArtist',track?.artist||'');
        if(track!==lastTrack){if(scrubbing)scrubCancelled=true;scrubbing=false;scrubTrack=null;lastTrack=track;}
        const url=track?.cover||'';if(url!==cover){cover=url;art.hidden=true;if(url)art.src=url;else art.removeAttribute('src');}
        const handler=mediaSessionController.handlers,snapshot=handler?.getSnapshot?.(),duration=Number(snapshot?.duration??handler?.getDuration?.()??0),position=Number(snapshot?.position??handler?.getPosition?.()??0),valid=Number.isFinite(duration)&&duration>0;
        const playing=Boolean(snapshot?.playing??s.isPlaying);play.classList.toggle('playing',playing);play.setAttribute('aria-label',playing?'Pause':'Play');
        seek.disabled=!valid;seek.max=valid?String(duration):'0';if(!valid){scrubbing=false;scrubTrack=null;}if(!scrubbing)seek.value=valid?String(Math.min(duration,Math.max(0,Number.isFinite(position)?position:0))):'0';
        setText('compactMediaPosition',formatTime(scrubbing?Number(seek.value):position||0));setText('compactMediaDuration',formatTime(valid?duration:0));
    }
    function draw(){
        const s=store.state,analyser=s.analyser,available=analyser&&s.audioContext?.state==='running'&&!s.isNativePlaybackActive?.()&&s.isPlaying;
        const message=reduced.matches?'Visualization off (reduced motion)':available?'Input waveform':s.isPlaying?'Waveform unavailable for this output':'Waveform paused';
        if(status.textContent!==message)status.textContent=message;
        if(!ctx)return;
        if(!available||reduced.matches){if(wasDrawing)ctx.clearRect(0,0,canvas.width,canvas.height);wasDrawing=false;return;}
        wasDrawing=true;ctx.clearRect(0,0,canvas.width,canvas.height);
        if(!samples||samples.length!==analyser.fftSize)samples=new Float32Array(analyser.fftSize);
        analyser.getFloatTimeDomainData(samples);ctx.strokeStyle=getComputedStyle(canvas).color;ctx.lineWidth=1.6;ctx.beginPath();
        for(let x=0;x<canvas.width;x++){const value=samples[Math.floor(x*samples.length/canvas.width)];const y=canvas.height*(.5-.46*Math.max(-1,Math.min(1,Number.isFinite(value)?value:0)));if(x===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);}ctx.stroke();
    }
    function tick(){timer=0;if(!dialog.open||document.hidden)return;try{if(semanticTick++%2===0||scrubbing)update();draw();}catch{status.textContent='Media state temporarily unavailable';}finally{if(dialog.open&&!document.hidden)timer=setTimeout(tick,store.state.isPlaying&&!reduced.matches&&!store.state.isNativePlaybackActive?.()?100:250);}}
    function stop(){if(timer)clearTimeout(timer);timer=0;samples=null;semanticTick=0;}
    function start(){if(!dialog.open||document.hidden||timer)return;tick();}
    art.addEventListener('load',()=>{art.hidden=!art.naturalWidth;});art.addEventListener('error',()=>{art.hidden=true;});
    store.subscribe('track:change',()=>{if(scrubbing){scrubCancelled=true;scrubbing=false;scrubTrack=null;}semanticTick=0;});
    trigger.addEventListener('click',()=>{returnFocus=document.activeElement;dialog.showModal();pushModalState(dialog.id);start();});dialog.addEventListener('close',()=>{stop();cover='';art.removeAttribute('src');ctx?.clearRect(0,0,canvas.width,canvas.height);scrubbing=false;scrubTrack=null;lastTrack=null;scrubCancelled=false;popModalState(dialog.id);(returnFocus||trigger).focus();});
    document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();else start();});
    by('compactMediaPrev').addEventListener('click',()=>mediaSessionController.handlers?.prev?.());by('compactMediaNext').addEventListener('click',()=>mediaSessionController.handlers?.next?.());play.addEventListener('click',()=>{const h=mediaSessionController.handlers;if(store.state.isPlaying)h?.pause?.();else h?.play?.();});
    for(const event of ['pointerdown','keydown'])seek.addEventListener(event,()=>{scrubCancelled=false;});
    seek.addEventListener('input',()=>{if(scrubCancelled)return;scrubbing=true;scrubTrack=lastTrack;setText('compactMediaPosition',formatTime(Number(seek.value)));});seek.addEventListener('change',()=>{const s=store.state,track=s.isStandalonePlayback?s.standaloneTrackList?.[s.standaloneTrackIndex]:s.allTracks?.[s.currentTrackIndex];const valid=!scrubCancelled&&(!scrubbing||scrubTrack===track)&&track===lastTrack&&!seek.disabled;scrubbing=false;scrubTrack=null;scrubCancelled=false;if(valid)mediaSessionController.handlers?.seekTo?.(Number(seek.value));});for(const event of ['blur','pointercancel'])seek.addEventListener(event,()=>{if(scrubbing)scrubCancelled=true;scrubbing=false;scrubTrack=null;});
}
