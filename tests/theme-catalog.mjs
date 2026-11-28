import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {THEMES, VALID_THEME_IDS, SYSTEM_THEME_PAIR, normalizeThemeId} from '../scripts/modules/theme-catalog.js';
import {loadCore} from '../scripts/modules/visualizers/registry.js';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const html=read('index.html'), preload=read('scripts/theme-preload.js');
assert.equal(VALID_THEME_IDS.length,17);
assert.equal(new Set(Object.values(THEMES).map(t=>t.name)).size,17);
assert.equal(SYSTEM_THEME_PAIR.light,'paper-sonata');
assert.equal(SYSTEM_THEME_PAIR.dark,'carbon-signal');
// The early classic bootstrap must agree with the module used after startup.
for(const id of [...VALID_THEME_IDS,'atlas','spotify','apple','studio-dark','cyberpunk','neon-night','midnight-amoled','brutalist-light','brutalist-dark','brutalist-minimalism-light','brutalist-minimalism-dark','invalid-theme']){
    let theme,color;
    const storage={getItem:(k)=>k==='cachymusic_active_theme'?id:null,setItem(){}};
    const root={setAttribute:(k,v)=>{if(k==='data-theme')theme=v},classList:{add(){}}};
    const document={cookie:'',documentElement:root,querySelector:()=>({setAttribute:(k,v)=>{if(k==='content')color=v;}})};
    const window={location:{search:''},localStorage:storage,sessionStorage:storage};
    vm.runInNewContext(preload,{document,window,localStorage:storage,sessionStorage:storage,URLSearchParams,navigator:{userAgent:''}});
    assert.equal(theme,normalizeThemeId(id));assert.equal(color,THEMES[theme].chrome);
}
// System mode resolves Paper Sonata / Carbon Signal without mutating saved explicit theme.
for (const [prefersLight, expectedTheme] of [[true, 'paper-sonata'], [false, 'carbon-signal']]) {
    let theme, color, reduced;
    const saved = { cachymusic_active_theme: 'nms', cachymusic_theme_mode: 'system', cachymusic_reduced_motion: prefersLight ? 'reduce' : 'normal' };
    const storage = { getItem: (k) => saved[k] ?? null, setItem(k, v) { saved[k] = v; } };
    const root = { setAttribute: (k, v) => { if (k === 'data-theme') theme = v; if (k === 'data-reduced-motion') reduced = v; }, classList: { add() {} } };
    const document = { cookie: '', documentElement: root, querySelector: () => ({ setAttribute: (k, v) => { if (k === 'content') color = v; } }) };
    const window = { location: { search: '' }, localStorage: storage, sessionStorage: storage, matchMedia: (q) => ({ matches: q.includes('light') ? prefersLight : false }) };
    vm.runInNewContext(preload, { document, window, localStorage: storage, sessionStorage: storage, URLSearchParams, navigator: { userAgent: '' } });
    assert.equal(theme, expectedTheme);
    assert.equal(color, THEMES[expectedTheme].chrome);
    assert.equal(saved.cachymusic_active_theme, 'nms');
    assert.equal(reduced, prefersLight ? 'true' : 'false');
}
for(const id of VALID_THEME_IDS){
    assert.ok(html.includes(`class="themeCardTitle">${THEMES[id].name}</span>`), id);
    assert.ok(html.includes(`class="themeCardDesc">${THEMES[id].description}</span>`), id);
}
// Registry browser tests execute actual modules; node test checks offline mappings without DOM imports.
const registry=read('scripts/modules/visualizers/registry.js');
for(const id of VALID_THEME_IDS)assert.ok(registry.includes(`'${id}': () => import(`), id);
assert.equal(typeof loadCore,'function');
console.log('PASS 17 theme labels, descriptions, registry mappings, system-mode pair, and prepaint compatibility');
