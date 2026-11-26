import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {THEMES, VALID_THEME_IDS, normalizeThemeId} from '../scripts/modules/theme-catalog.js';
import {loadCore} from '../scripts/modules/visualizers/registry.js';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const html=read('index.html'), preload=read('scripts/theme-preload.js');
assert.equal(VALID_THEME_IDS.length,12);
assert.equal(new Set(Object.values(THEMES).map(t=>t.name)).size,12);
// The early classic bootstrap must agree with the module used after startup.
for(const id of [...VALID_THEME_IDS,'atlas','spotify','apple','studio-dark','cyberpunk','neon-night','midnight-amoled','brutalist-light','brutalist-dark','brutalist-minimalism-light','brutalist-minimalism-dark','invalid-theme']){
    let theme,color;
    const storage={getItem:()=>id,setItem(){}};
    const root={setAttribute:(k,v)=>{if(k==='data-theme')theme=v},classList:{add(){}}};
    const document={cookie:'',documentElement:root,querySelector:()=>({setAttribute:(k,v)=>{if(k==='content')color=v;}})};
    const window={location:{search:''},localStorage:storage,sessionStorage:storage};
    vm.runInNewContext(preload,{document,window,localStorage:storage,sessionStorage:storage,URLSearchParams,navigator:{userAgent:''}});
    assert.equal(theme,normalizeThemeId(id));assert.equal(color,THEMES[theme].chrome);
}
for(const id of VALID_THEME_IDS){
    assert.ok(html.includes(`class="themeCardTitle">${THEMES[id].name}</span>`));
    assert.ok(html.includes(`class="themeCardDesc">${THEMES[id].description}</span>`));
}
// Registry browser tests execute actual modules; node test checks offline mappings without DOM imports.
const registry=read('scripts/modules/visualizers/registry.js');
for(const id of VALID_THEME_IDS)assert.ok(registry.includes(`'${id}': () => import(`));
assert.equal(typeof loadCore,'function');
console.log('PASS 12 theme labels, descriptions, registry mappings and prepaint compatibility');
