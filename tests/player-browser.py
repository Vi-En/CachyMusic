"""Execute the actual playback controller and extracted presentation in a Chromium DOM fixture."""
from pathlib import Path
import importlib.util, argparse
from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright
spec = importlib.util.spec_from_file_location('renderer', Path(__file__).with_name('visualizer-browser.py'))
fixture = importlib.util.module_from_spec(spec); spec.loader.exec_module(fixture)
parser = argparse.ArgumentParser(); parser.add_argument('--chromium',default='/usr/bin/chromium'); args=parser.parse_args()
root = fixture.ROOT
shell = BeautifulSoup((root/'index.html').read_text(),'html.parser')
for tag in shell.select('script,link,meta[http-equiv]'): tag.decompose()
for tag in shell.select('img'): tag.attrs.pop('src',None)
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path=args.chromium,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':393,'height':873})
    errors=[]; page.on('pageerror',lambda e:errors.append(str(e)))
    page.set_content(str(shell))
    modules=fixture.install_module_map(page, ['player-core.js','state.js','utils.js','player-presentation.js','audio-engine.js','control-ui.js','playlist-playback.js'])
    result=page.evaluate('''async urls=>{
        const modules={};for(const [name,url] of Object.entries(urls))modules[name]=await import(url);
        const core=modules['player-core.js'], st=modules['state.js'].store.state;
        const track={id:'test-track',title:'Example title',artist:'Example artist',format:'FLAC',filename:'test.flac',sampleRate:192000,bitDepth:24,channels:2,size:1048576};
        st.allTracks=[track];st.currentTrackIndex=0;st.currentTrack=track;
        core.updatePlaybackProgress(20,40);if(document.querySelector('#progressBar').style.width!=='50%')throw Error('progress render');
        core.updatePlaybackProgress(NaN,NaN);if(document.querySelector('#progressBar').style.width!=='0%'||document.querySelector('#progressCon').getAttribute('aria-disabled')!=='true')throw Error('stale invalid progress');
        const info=core.updateSignalPathUi(track);
        if(info.label!=='UNVERIFIED'||document.querySelector('#auditMetricLatency').textContent!=='Unavailable')throw Error('false graph status');
        modules['player-presentation.js'].renderTrackMetadata(track,false,core.updateDacStatusUi);
        if(document.querySelector('#statTitle').textContent!=='Example title')throw Error('metadata binding');
        core.updateMarqueeText(document.querySelector('#trackName'),'<literal>');
        if(document.querySelector('#trackName').textContent!=='<literal>')throw Error('marquee text not preserved');
        modules['utils.js'].safeStorage.setItem('cachymusic_last_track_id','test-track');
        if(core.findTrackIndexBySavedState([track])!==0)throw Error('saved identity');
        const controls=modules['control-ui.js'];
        const b=document.querySelector('#libraryToolsToggleBtn'), panel=document.querySelector('#libraryControls');
        const dispose=controls.bindDisclosure(b,panel); if(!panel.hidden)throw Error('tools initial state');
        b.click();if(panel.hidden||b.getAttribute('aria-expanded')!=='true')throw Error('tools open');
        panel.style.display='flex';b.click();if(!panel.hidden||b.getAttribute('aria-expanded')!=='false')throw Error('tools collapse');dispose();
        const engine=modules['audio-engine.js'];
        engine.setVolume(1.25,true,false);
        for(const id of ['volumeSlider','miniVolumeSlider']){const slider=document.getElementById(id);if(slider.value!=='1.25'||slider.getAttribute('aria-valuetext')!=='125 percent')throw Error(id+' volume divergence');}
        engine.setVolume(.8,true,false);
        if(engine.getConfirmedAudioRoute()!==null)throw Error('route confirmed before graph');
        const context=engine.initAudioContext();
        if(!context)throw Error('browser AudioContext unavailable');
        const route=engine.getConfirmedAudioRoute();
        if(!['direct','fallback','worklet'].includes(route))throw Error('route was not confirmed: '+route);
        const activeInfo=core.updateSignalPathUi(track);
        if(!activeInfo.graphReady||!activeInfo.output.includes('graph'))throw Error('confirmed graph not reflected');
        // A locally synthesized, quiet WAV exercises the actual media element and controller.
        const rate=48000, frames=rate*3, bytes=new ArrayBuffer(44+frames*2), dv=new DataView(bytes);
        const text=(at,s)=>{for(let i=0;i<s.length;i++)dv.setUint8(at+i,s.charCodeAt(i))};
        text(0,'RIFF');dv.setUint32(4,36+frames*2,true);text(8,'WAVE');text(12,'fmt ');dv.setUint32(16,16,true);dv.setUint16(20,1,true);dv.setUint16(22,1,true);dv.setUint32(24,rate,true);dv.setUint32(28,rate*2,true);dv.setUint16(32,2,true);dv.setUint16(34,16,true);text(36,'data');dv.setUint32(40,frames*2,true);
        for(let i=0;i<frames;i++)dv.setInt16(44+i*2,Math.round(Math.sin(i*2*Math.PI*440/rate)*30),true);
        const url=URL.createObjectURL(new Blob([bytes],{type:'audio/wav'}));
        track.filename='test.wav';track.format='WAV';track.src=url;track.sampleRate=rate;st.audio.src=url;st.audio.muted=true;
        await st.audio.play();core.syncPlayPauseUI(true,true);
        let changed=false;
        await st.withAudioEdit(()=>{if(!st.audio.paused)throw Error('edit ran before media pause');changed=true;engine.setDspBoost('amp',true)});
        if(!changed||!st.audio.paused)throw Error('missing temporary pause');
        for(let i=0;i<50&&st.audio.paused;i++)await new Promise(r=>setTimeout(r,20));
        if(st.audio.paused||!st.audio.muted)throw Error('resume failed or changed mute');
        await st.withAudioEdit(()=>engine.setDspBoost('amp',false));core.pauseAudio();
        await new Promise(r=>setTimeout(r,250));if(!st.audio.paused)throw Error('user pause was overridden');
        const a={...track,id:'playlist-a',title:'A'},bTrack={...track,id:'playlist-b',title:'B'},outside={...track,id:'outside',title:'Outside'};
        st.allTracks=[a,bTrack,outside];st.displayedTracks=[outside];st.playQueue=[];st.repeatMode='off';
        const plan={};modules['playlist-playback.js'].startPlaylistSession(plan,'test',[a,bTrack]);
        await core.loadTrack(0,true,0,null,false,false,plan.playlistPlayback);
        const until=async test=>{for(let i=0;i<80&&!test();i++)await new Promise(r=>setTimeout(r,25));if(!test())throw Error('playlist transport state did not settle');};
        await until(()=>st.currentTrackIndex===0&&!st.audio.paused);
        st.displayedTracks=[];st.playQueue=[outside];await core.nextTrack(false);await until(()=>st.currentTrackIndex===2&&!st.audio.paused);
        if(st.playlistPlayback.cursor!==0)throw Error('queue advanced playlist cursor');
        await core.nextTrack(false);await until(()=>st.currentTrackIndex===1&&!st.audio.paused);
        core.prevTrack(false);await until(()=>st.currentTrackIndex===2&&!st.audio.paused);
        if(st.playlistPlayback.cursor!==0)throw Error('previous did not restore queue interruption cursor');
        core.prevTrack(false);await until(()=>st.currentTrackIndex===0&&!st.audio.paused);
        await core.nextTrack(false);await until(()=>st.currentTrackIndex===2&&!st.audio.paused);
        await core.nextTrack(false);await until(()=>st.currentTrackIndex===1&&!st.audio.paused);
        await core.nextTrack(false);await until(()=>st.audio.paused);
        if(st.currentTrackIndex!==1)throw Error('playlist escaped at end');
        st.playlistPlayback=null;
        st.audio.removeAttribute('src');st.audio.load();URL.revokeObjectURL(url);
        await context.close();
        if(engine.getConfirmedAudioRoute()!==null)throw Error('closed graph still confirmed');
        return 'PASS real playback module imports, metadata DOM rendering, literal marquee text, session restore lookup, uninitialized, connected and closed graph status; real media pause/resume, mute preservation and user pause ownership; playlist browsing independence, explicit queue interruption, resume, actual previous/next history and stop at end';
    }''',modules)
    page.wait_for_timeout(150); assert not errors,errors
    print(result); browser.close()
