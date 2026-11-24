// Native controls: state changes here do not dispatch synthetic input events.
export function bindDisclosure(button, panel) {
    if (!button || !panel) return () => {};
    const sync = () => {
        button.setAttribute('aria-expanded', String(!panel.hidden));
        button.classList.toggle('active', !panel.hidden);
    };
    const toggle = () => { panel.hidden = !panel.hidden; sync(); };
    sync();
    button.addEventListener('click', toggle);
    return () => button.removeEventListener('click', toggle);
}

export function syncVolumeSliders(value, ...sliders) {
    for (const slider of sliders) {
        if (!slider) continue;
        slider.value = String(value);
        // Read back the native input's clamped value, not an assumed range.
        const min = Number(slider.min), max = Number(slider.max);
        const actual = Number(slider.value);
        const fill = max > min ? Math.max(0, Math.min(100, (actual - min) / (max - min) * 100)) : 0;
        slider.style.setProperty('--volume-fill', `${fill}%`);
        slider.classList.toggle('amplified', actual > 1);
        slider.setAttribute('aria-valuetext', `${Math.round(actual * 100)} percent`);
    }
}
