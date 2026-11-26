// Own the Settings navigation and search independently of audio processing.
// Caches per-panel searchable text so typing never triggers full-DOM getComputedStyle walks.
export function bindSettingsNavigation({ root = document, storage, initialCategory = 'audio' } = {}) {
    const buttons = [...root.querySelectorAll('#settingsCategoryNav .settingsCatBtn')];
    const grid = root.getElementById('settingsLayoutGrid');
    if (!grid || !buttons.length) return () => {};
    const input = root.getElementById('settingsSearchInput');
    const status = root.getElementById('settingsSearchStatus');
    const clear = root.getElementById('settingsSearchResetBtn');
    const panels = [...grid.querySelectorAll('.settingsSectionPanel[data-settings-cat]')];
    const columns = [...grid.querySelectorAll('.settingsCol')];
    const autoOpened = new Set();
    const disposers = [];
    const textIndexCache = new WeakMap();
    let category = initialCategory;

    const listen = (el, name, fn) => {
        if (!el) return;
        el.addEventListener(name, fn);
        disposers.push(() => el.removeEventListener(name, fn));
    };

    function availableText(el) {
        if (textIndexCache.has(el)) return textIndexCache.get(el);
        const walker = root.createTreeWalker(el, 4 /* SHOW_TEXT */);
        const chunks = [];
        const visibility = new Map();
        const win = root.defaultView;
        function available(node) {
            if (!node || node === el) return true;
            if (!visibility.has(node)) {
                visibility.set(
                    node,
                    !node.hidden &&
                    node.getAttribute('aria-hidden') !== 'true' &&
                    !['SCRIPT', 'STYLE'].includes(node.tagName) &&
                    (!win || win.getComputedStyle(node).display !== 'none') &&
                    available(node.parentElement)
                );
            }
            return visibility.get(node);
        }
        while (walker.nextNode()) {
            if (available(walker.currentNode.parentElement)) chunks.push(walker.currentNode.nodeValue);
        }
        const text = chunks.join(' ').replace(/\s+/g, ' ').trim().toLowerCase();
        textIndexCache.set(el, text);
        return text;
    }

    function invalidateIndexCache() {
        for (const panel of panels) {
            textIndexCache.delete(panel);
            for (const details of panel.querySelectorAll('details')) {
                textIndexCache.delete(details);
            }
        }
    }

    const matches = (text, terms) => terms.every(term => text.includes(term));

    function render() {
        if (!buttons.some(b => b.dataset.cat === category)) category = 'audio';
        const terms = (input?.value || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
        const searching = terms.length > 0;
        if (clear) clear.hidden = !searching;
        for (const details of autoOpened) details.open = false;
        autoOpened.clear();
        grid.dataset.activeCat = searching ? 'search' : category;
        for (const button of buttons) {
            const selected = !searching && button.dataset.cat === category;
            button.classList.toggle('active', selected);
            if (selected) button.setAttribute('aria-current', 'page');
            else button.removeAttribute('aria-current');
        }
        let count = 0;
        for (const panel of panels) {
            const categories = panel.dataset.settingsCat.split(/\s+/);
            const shown = searching ? matches(availableText(panel), terms) : category === 'all' || categories.includes(category);
            panel.style.display = shown ? '' : 'none';
            if (!shown) continue;
            count++;
            if (searching) {
                for (const details of panel.querySelectorAll('details')) {
                    if (!details.open && matches(availableText(details), terms)) {
                        details.open = true;
                        autoOpened.add(details);
                    }
                }
            }
        }
        for (const column of columns) {
            column.style.display = panels.some(p => column.contains(p) && p.style.display !== 'none') ? '' : 'none';
        }
        if (status) {
            status.textContent = searching
                ? (count === 0 ? 'No matching settings.' : `${count} matching ${count === 1 ? 'section' : 'sections'}.`)
                : '';
        }
    }

    listen(input, 'input', render);
    listen(input, 'focus', invalidateIndexCache);
    listen(clear, 'click', () => {
        if (input) {
            input.value = '';
            render();
            input.focus();
        }
    });
    for (const button of buttons) {
        listen(button, 'click', () => {
            if (input) input.value = '';
            category = button.dataset.cat;
            storage?.setItem('cachymusic_settings_cat', category);
            render();
        });
    }
    render();
    return () => {
        disposers.forEach(fn => fn());
        for (const details of autoOpened) details.open = false;
    };
}
