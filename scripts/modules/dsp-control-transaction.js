// Ordinary DSP edits are serialized by the audio edit guard. Keep persistence
// outside the speculative phase, and restore both state and route on failure.
export const CONTROL_KEYS = Object.freeze({
    isLimiter:'cachymusic_limiter', isAmpBoost:'cachymusic_amp_boost',
    isBassBoost:'cachymusic_bass_boost', isVocalBoost:'cachymusic_vocal_boost',
    isTrebleBoost:'cachymusic_treble_boost', isCrossfeed:'cachymusic_crossfeed',
    isAmbiophonics:'cachymusic_ambiophonics', isSubsonic:'cachymusic_subsonic',
    isAgpEnabled:'cachymusic_agp', isSurroundWidener:'cachymusic_surround_ms',
    isPhaseInvert:'cachymusic_phase_invert', isMonoMix:'cachymusic_mono_mix',
    peqGains:'cachymusic_peq_gains', peqQs:'cachymusic_peq_qs',
    isPeqBypassed:'cachymusic_peq_bypassed', stereoBalance:'cachymusic_stereo_balance',
    isPitchLockTempo:'cachymusic_pitch_lock'
});
const copy = value => Array.isArray(value) ? [...value] : value;
const encode = value => Array.isArray(value) ? JSON.stringify(value) : String(value);
export function createDspControlTransaction({state, storage, acknowledge, restore, refresh=()=>{}}) {
    let active = false;
    const keys = Object.keys(CONTROL_KEYS);
    const managed = new Set(Object.values(CONTROL_KEYS));
    return {
        write(key,value) {
            if (!active || !managed.has(key)) storage.setItem(key,value);
        },
        async run(change, checkpoint=()=>{}) {
            if (active) throw Error('Concurrent DSP control transaction');
            const before = Object.fromEntries(keys.map(key=>[key,copy(state[key])]));
            active = true;
            let committed=false;
            try {
                checkpoint();
                await change();
                checkpoint();
                await acknowledge();
                checkpoint();
                for (const key of keys) {
                    if (encode(before[key])!==encode(state[key])) storage.setItem(CONTROL_KEYS[key],encode(state[key]));
                }
                committed=true;
            } catch (error) {
                Object.assign(state,before);
                try { await restore(); await acknowledge(); }
                catch (rollbackError) { const failure=new AggregateError([error,rollbackError],'DSP update and recovery failed');failure.recoveryFailed=true;throw failure; }
                throw error;
            } finally { active=false; refresh(committed); }
        }
    };
}
// One running and at most one pending value per control. Input events never
// build an unbounded queue of stale slider positions.
export function createLatestControlQueue(run, identity=()=>null) {
    const slots=new Map();
    return function submit(key, change) {
        let slot=slots.get(key);
        const entry={change,owner:identity()};
        if(slot){slot.latest=entry;return slot.done;}
        slot={latest:entry,done:null};slots.set(key,slot);
        slot.done=(async()=>{
            try {
                while(slot.latest){
                    const entry=slot.latest;slot.latest=null;
                    if(entry.owner===identity())await run(entry.change);
                }
            } finally {slots.delete(key);}
        })();
        return slot.done;
    };
}
