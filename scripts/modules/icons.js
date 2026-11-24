const paths = {
    close: 'm6 6 12 12M18 6 6 18',
    info: 'M12 11v5m0-8h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z',
    music: 'M9 18V5l12-2v13M9 18a3 2 0 1 1-6 0 3 2 0 0 1 6 0Zm12-2a3 2 0 1 1-6 0 3 2 0 0 1 6 0Z',
    both: 'm8 9 4-4 4 4m-8 6 4 4 4-4',
    play: 'M8 5v14l12-7Z',
    up: 'm6 15 6-6 6 6',
    down: 'm6 9 6 6 6-6',
    search: 'm16 16 4 4M18 11a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z'
};

export function uiIcon(name) {
    return `<svg class="uiIcon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name]}"/></svg>`;
}
