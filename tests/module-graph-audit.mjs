/**
 * Module Dependency Graph & Critical Shell Budget Audit (P06):
 * - Ensures 0 circular static imports across all scripts/**.
 * - Ensures themes.js -> custom-theme-studio-ui.js has no reverse import cycle.
 * - Measures static eager JS + CSS closure size (uncompressed & gzipped <= 350 KiB).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const root = path.resolve(new URL('..', import.meta.url).pathname);

function walkFiles(dir) {
    const out = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) out.push(...walkFiles(full));
        else if (entry.name.endsWith('.js')) out.push(full);
    }
    return out;
}

function parseEdges(filePath) {
    const src = fs.readFileSync(filePath, 'utf8');
    const staticDeps = [];
    const dynamicDeps = [];
    for (const m of src.matchAll(/(?:import\s+(?:[^'"]+from\s+)?|export\s+[^'"]+from\s+)['"](\.[^'"]+)['"]/g)) {
        const dep = path.resolve(path.dirname(filePath), m[1]);
        if (fs.existsSync(dep) && dep.endsWith('.js')) staticDeps.push(path.relative(root, dep).replace(/\\/g, '/'));
    }
    for (const m of src.matchAll(/import\s*\(\s*['"](\.[^'"]+)['"]\s*\)/g)) {
        const dep = path.resolve(path.dirname(filePath), m[1]);
        if (fs.existsSync(dep) && dep.endsWith('.js')) dynamicDeps.push(path.relative(root, dep).replace(/\\/g, '/'));
    }
    return { staticDeps, dynamicDeps };
}

const jsFiles = walkFiles(path.join(root, 'scripts'));
const graph = new Map();
for (const f of jsFiles) {
    const rel = path.relative(root, f).replace(/\\/g, '/');
    graph.set(rel, parseEdges(f));
}

// 1. Detect static import cycles via DFS coloring (0=unvisited, 1=visiting, 2=done)
const state = new Map();
const cycles = [];
function dfs(node, stack) {
    state.set(node, 1);
    stack.push(node);
    const edges = graph.get(node)?.staticDeps || [];
    for (const dep of edges) {
        const st = state.get(dep) || 0;
        if (st === 1) {
            const idx = stack.indexOf(dep);
            cycles.push([...stack.slice(idx), dep]);
        } else if (st === 0) {
            dfs(dep, stack);
        }
    }
    stack.pop();
    state.set(node, 2);
}
for (const rel of graph.keys()) {
    if (!state.get(rel)) dfs(rel, []);
}
assert.equal(cycles.length, 0, `Static JS import cycles detected: ${JSON.stringify(cycles)}`);

// 2. Verify themes.js <-> custom-theme-studio-ui.js has zero reverse dependency
const studioEdges = graph.get('scripts/modules/custom-theme-studio-ui.js');
assert.ok(studioEdges, 'Missing custom-theme-studio-ui.js');
assert.ok(!studioEdges.staticDeps.includes('scripts/modules/themes.js'), 'custom-theme-studio-ui.js statically imports themes.js');
assert.ok(!studioEdges.dynamicDeps.includes('scripts/modules/themes.js'), 'custom-theme-studio-ui.js dynamically imports themes.js');

// 3. Measure critical shell static closure (HTML + pre-paint/pwa JS + CSS imports + app.js static JS)
const criticalFiles = new Set([
    'index.html',
    'scripts/theme-preload.js',
    'scripts/pwa-init.js'
]);
const visitedJs = new Set();
function collectJs(rel) {
    if (visitedJs.has(rel)) return;
    visitedJs.add(rel);
    criticalFiles.add(rel);
    for (const dep of graph.get(rel)?.staticDeps || []) collectJs(dep);
}
collectJs('scripts/modules/app.js');

const visitedCss = new Set();
function collectCss(rel) {
    if (visitedCss.has(rel)) return;
    visitedCss.add(rel);
    criticalFiles.add(rel);
    const full = path.join(root, rel);
    const src = fs.readFileSync(full, 'utf8');
    for (const m of src.matchAll(/@import\s+url\(['"]?([^'")]+)['"]?\)/g)) {
        const dep = path.relative(root, path.resolve(path.dirname(full), m[1])).replace(/\\/g, '/');
        collectCss(dep);
    }
}
collectCss('stylesheets/homepage.css');

let rawBytes = 0;
let gzBytes = 0;
for (const rel of criticalFiles) {
    const buf = fs.readFileSync(path.join(root, rel));
    rawBytes += buf.length;
    gzBytes += zlib.gzipSync(buf, { level: 9 }).length;
}
const BUDGET_GZ = 350 * 1024;
assert.ok(gzBytes <= BUDGET_GZ, `Critical shell gzipped ${gzBytes} B exceeds ${BUDGET_GZ} B`);
console.log(
    `PASS 0 circular static imports (${graph.size} modules), 0 themes/studio back-edges, critical closure=${criticalFiles.size} files (${rawBytes} B raw / ${gzBytes} B gzipped, budget ${BUDGET_GZ} B)`
);
