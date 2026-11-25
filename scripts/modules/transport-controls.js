// Shared main and mini transport bindings. Preserve native keyboard focus.
export function bindTransportControls({state, play, previous, next, setVolume, syncVolume, updateVolumeIcon, volumeLevel,
    onOrderChange, updateRepeat, playButtons, previousButtons, nextButtons, muteButtons, shuffleBtn, shufflePlayBtn, repeatBtn}) {
    const bind = (buttons, action) => buttons.forEach(button => button?.addEventListener('click', () => action()));
    const syncShuffle = () => {
        shuffleBtn?.classList.toggle('active', state.isShuffle);
        shuffleBtn?.setAttribute('aria-pressed', String(state.isShuffle));
        shuffleBtn?.setAttribute('title', state.isShuffle ? 'Shuffle Active' : 'Toggle Shuffle');
        onOrderChange();
    };
    bind(playButtons, play);
    bind(previousButtons, previous);
    bind(nextButtons, next);
    bind([shuffleBtn], () => { state.isShuffle = !state.isShuffle; syncShuffle(); });
    bind([shufflePlayBtn], () => { state.isShuffle = true; syncShuffle(); next(); });
    bind([repeatBtn], () => {
        state.repeatMode = state.repeatMode === 'all' ? 'one' : state.repeatMode === 'one' ? 'off' : 'all';
        updateRepeat();
    });
    bind(muteButtons, () => {
        if (!state.audio) return;
        state.audio.muted = !state.audio.muted;
        syncVolume();
        if (state.audio.muted) {
            if (volumeLevel) volumeLevel.textContent = '0%';
            updateVolumeIcon(0);
        } else {
            // Application mute must not modify the OS mixer or other applications.
            setVolume(state.currentVolumeValue, true, false, {preserveMute: true, dispatchSystem: false});
        }
    });
}
