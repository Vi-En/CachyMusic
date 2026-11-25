// Confirmation is reserved for resource-intensive or disruptive changes.
export function audioChangeWarning(key, value) {
    switch (key) {
    case 'mathPrecision': return value === '64' ? ['Use 64-bit processing?', 'Double-precision processing can increase CPU use and battery drain.'] : null;
    case 'ditherMode': return value === 'shaped' ? ['Enable noise shaping?', 'Noise shaping adds processing work. It does not guarantee a particular physical output bit depth.'] : null;
    case 'isUltrasonic': return value ? ['Enable ultrasonic filtering?', 'Adds processing when the audio graph supports the selected cutoff.'] : null;
    case 'isAmbiophonics': return value ? ['Enable speaker processing?', 'Adds spatial processing and replaces headphone crossfeed. Use with speakers.'] : null;
    case 'isHardwareGain': return ['Change system volume control?', 'Switches between app gain and the device mixer. Check the listening level before continuing.'];
    case 'bufferLatencyTarget': return ['Change buffer profile?', 'The audio graph may need to restart. Playback can briefly stop or the change may wait for a compatible track.'];
    case 'androidNative': return ['Change playback engine?', 'The current track may reload. Native playback bypasses the Web Audio equalizer and effects.'];
    case 'continuousPcm': return value ? ['Enable continuous lossless playback?', 'Prebuffering uses additional memory and may reload the current track.'] : null;
    default: return null;
    }
}
let pendingConfirmation = false;
export async function confirmAudioChange(key, value, doc = document) {
    const warning = audioChangeWarning(key, value);
    if (!warning) return true;
    if (pendingConfirmation) return false;
    const dialog = doc.getElementById('audioChangeDialog');
    if (!dialog?.showModal) return typeof globalThis.confirm === 'function' && globalThis.confirm(warning.join('\n\n'));
    pendingConfirmation = true;
    const trigger = doc.activeElement;
    dialog.querySelector('h2').textContent = warning[0];
    dialog.querySelector('p').textContent = warning[1];
    const accept = dialog.querySelector('button[value="allow"]');
    if (accept) accept.textContent = warning[0].replace(/\?$/, '');
    dialog.returnValue = 'cancel';
    try {
        return await new Promise(resolve => {
            const close = () => resolve(dialog.returnValue === 'allow');
            dialog.addEventListener('close', close, {once:true});
            try { dialog.showModal(); } catch (_) { dialog.removeEventListener('close', close); resolve(false); }
        });
    } finally {
        pendingConfirmation = false;
        if (trigger?.isConnected) trigger.focus({preventScroll:true});
    }
}

// Serialize edits and keep output gated even if a new transport starts.
// Async commands must call the supplied checkpoint before each side effect.
export function createAudioEditGuard({isPlaying, pause, resume, identity, acquire=async()=>{}, release=()=>{}, acknowledge=async()=>{}, finishPause=()=>{}, onUnsafe=()=>{}, delay=100, settle=25, schedule=setTimeout, cancel=clearTimeout, onError=console.warn}) {
    let lease=null, timer=null, pending=0, tail=Promise.resolve();
    function finish(){
        if(pending||!lease)return;
        if(timer!==null)cancel(timer);
        timer=schedule(async()=>{
            timer=null;const owner=lease;lease=null;
            const finishing=(async()=>{try {
                if(owner.playing&&!owner.failed&&owner.identity===identity())await resume();
            }catch(error){owner.failed=true;onError(error);onUnsafe(error);}
            finally {
                try { finishPause(owner.failed, owner.identity===identity()); }
                finally { try { release(); } catch(error) { onError(error);onUnsafe(error); } }
            }})();
            tail=finishing.catch(()=>{});
        },delay);
    }
    return function run(change){
        if(timer!==null){cancel(timer);timer=null;}
        const initialIdentity=identity();
        pending++;
        const task=tail.then(async()=>{
            if(lease&&lease.identity!==identity())throw Error('Playback changed before queued audio edit');
            if(initialIdentity!==identity() && (!lease || initialIdentity!==lease.initialIdentity))throw Error('Playback changed before audio edit');
            if(!lease){
                if(initialIdentity!==identity())throw Error('Playback changed before audio edit');
                const playing=isPlaying();
                const owner=lease={identity:identity(),initialIdentity,playing,failed:false};
                try{
                    try { await acquire(); } catch(error) { onUnsafe(error);throw error; }
                    if(owner.identity!==identity())throw Error('Playback changed before audio edit');
                    if(playing){pause();owner.identity=identity();await new Promise(r=>schedule(r,settle));}
                }catch(error){owner.failed=true;throw error;}
            }
            const owner=lease;
            if(owner.failed)throw Error('Previous audio edit failed');
            const checkpoint=()=>{if(owner.identity!==identity())throw Error('Playback changed during audio edit');};
            try {checkpoint();const result=await change(checkpoint);await acknowledge();checkpoint();return result;}
            catch(error){owner.failed=true;if(error.recoveryFailed)onUnsafe(error);throw error;}
        });
        tail=task.catch(()=>{});
        return task.finally(()=>{pending--;finish();});
    };
}
