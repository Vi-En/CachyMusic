/**
 * Procedural, zero-network SVG tileable textures for Custom Theme Studio.
 * All SVG inputs are strictly allowlisted hex colors and bounded numbers.
 */
export const TEXTURE_CATALOG = Object.freeze([
    Object.freeze({ id: 'none', name: 'None', defaultScale: 64, defaultOpacity: 0 }),
    Object.freeze({ id: 'film-grain', name: 'Fine grain', defaultScale: 72, defaultOpacity: 0.14 }),
    Object.freeze({ id: 'paper-fiber', name: 'Paper fiber', defaultScale: 96, defaultOpacity: 0.18 }),
    Object.freeze({ id: 'brushed-metal', name: 'Brushed metal', defaultScale: 80, defaultOpacity: 0.14 }),
    Object.freeze({ id: 'blueprint-grid', name: 'Blueprint grid', defaultScale: 32, defaultOpacity: 0.18 }),
    Object.freeze({ id: 'dot-matrix', name: 'Dot matrix', defaultScale: 16, defaultOpacity: 0.22 }),
    Object.freeze({ id: 'carbon-weave', name: 'Carbon weave', defaultScale: 16, defaultOpacity: 0.22 }),
    Object.freeze({ id: 'diagonal-hatch', name: 'Diagonal hatch', defaultScale: 14, defaultOpacity: 0.18 }),
    Object.freeze({ id: 'topo-contour', name: 'Contour rings', defaultScale: 96, defaultOpacity: 0.16 }),
    Object.freeze({ id: 'linen-weave', name: 'Linen weave', defaultScale: 24, defaultOpacity: 0.18 }),
    Object.freeze({ id: 'hex-mesh', name: 'Hex mesh', defaultScale: 36, defaultOpacity: 0.18 })
]);

export const VALID_TEXTURE_IDS = new Set(TEXTURE_CATALOG.map(t => t.id));

const SAFE_HEX_RE = /^#[0-9a-f]{6}$/i;
const URL_CACHE = new Map();
const MAX_URL_CACHE = 48;

function safeColor(hex) {
    return SAFE_HEX_RE.test(String(hex || '')) ? String(hex).toLowerCase() : '#94a3b8';
}

function clampNum(val, min, max, fallback) {
    const n = Number(val);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
}

function svgMarkup(id, stroke, opacity, size) {
    const s = size;
    const h = (s * 0.5).toFixed(2);
    const op = opacity.toFixed(3);
    const soft = (opacity * 0.45).toFixed(3);
    switch (id) {
        case 'film-grain':
            return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">` +
                `<circle cx="${(s * 0.18).toFixed(1)}" cy="${(s * 0.22).toFixed(1)}" r="0.9" fill="${stroke}" fill-opacity="${op}"/>` +
                `<circle cx="${(s * 0.72).toFixed(1)}" cy="${(s * 0.14).toFixed(1)}" r="0.8" fill="${stroke}" fill-opacity="${soft}"/>` +
                `<circle cx="${(s * 0.44).toFixed(1)}" cy="${(s * 0.56).toFixed(1)}" r="1.0" fill="${stroke}" fill-opacity="${op}"/>` +
                `<circle cx="${(s * 0.86).toFixed(1)}" cy="${(s * 0.66).toFixed(1)}" r="0.9" fill="${stroke}" fill-opacity="${soft}"/>` +
                `<circle cx="${(s * 0.26).toFixed(1)}" cy="${(s * 0.84).toFixed(1)}" r="0.8" fill="${stroke}" fill-opacity="${op}"/>` +
                `<circle cx="${(s * 0.62).toFixed(1)}" cy="${(s * 0.36).toFixed(1)}" r="0.7" fill="${stroke}" fill-opacity="${soft}"/></svg>`;
        case 'paper-fiber':
            return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">` +
                `<path d="M4 ${h} Q ${h} 6 ${s - 6} ${(s * 0.42).toFixed(1)}" fill="none" stroke="${stroke}" stroke-opacity="${soft}" stroke-width="0.9"/>` +
                `<path d="M8 ${(s * 0.82).toFixed(1)} Q ${(s * 0.6).toFixed(1)} ${(s * 0.62).toFixed(1)} ${s - 4} ${(s * 0.78).toFixed(1)}" fill="none" stroke="${stroke}" stroke-opacity="${op}" stroke-width="0.8"/>` +
                `<path d="M${(s * 0.25).toFixed(1)} 4 Q ${(s * 0.35).toFixed(1)} ${h} ${(s * 0.22).toFixed(1)} ${s - 4}" fill="none" stroke="${stroke}" stroke-opacity="${soft}" stroke-width="0.8"/></svg>`;
        case 'brushed-metal':
            return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="16" viewBox="0 0 ${s} 16">` +
                `<line x1="0" y1="2" x2="${s}" y2="2" stroke="${stroke}" stroke-opacity="${op}" stroke-width="1"/>` +
                `<line x1="0" y1="7" x2="${s}" y2="7" stroke="${stroke}" stroke-opacity="${soft}" stroke-width="0.8"/>` +
                `<line x1="0" y1="12" x2="${s}" y2="12" stroke="${stroke}" stroke-opacity="${op}" stroke-width="1"/></svg>`;
        case 'blueprint-grid':
            return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">` +
                `<path d="M ${s} 0 L 0 0 0 ${s}" fill="none" stroke="${stroke}" stroke-opacity="${op}" stroke-width="1"/>` +
                `<path d="M ${h} 0 V ${s} M 0 ${h} H ${s}" fill="none" stroke="${stroke}" stroke-opacity="${soft}" stroke-width="0.6"/></svg>`;
        case 'dot-matrix':
            return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">` +
                `<circle cx="${h}" cy="${h}" r="${Math.max(1, s * 0.09).toFixed(2)}" fill="${stroke}" fill-opacity="${op}"/></svg>`;
        case 'carbon-weave':
            return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">` +
                `<rect x="0" y="0" width="${h}" height="${h}" fill="${stroke}" fill-opacity="${op}"/>` +
                `<rect x="${h}" y="${h}" width="${h}" height="${h}" fill="${stroke}" fill-opacity="${soft}"/></svg>`;
        case 'diagonal-hatch':
            return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">` +
                `<path d="M-2,${s + 2} l${s + 4},-${s + 4} M-2,2 l4,-4 M${s - 2},${s + 2} l4,-4" fill="none" stroke="${stroke}" stroke-opacity="${op}" stroke-width="1"/></svg>`;
        case 'topo-contour':
            return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">` +
                `<circle cx="${h}" cy="${h}" r="${(s * 0.42).toFixed(1)}" fill="none" stroke="${stroke}" stroke-opacity="${soft}" stroke-width="0.9"/>` +
                `<circle cx="${h}" cy="${h}" r="${(s * 0.25).toFixed(1)}" fill="none" stroke="${stroke}" stroke-opacity="${op}" stroke-width="1"/></svg>`;
        case 'linen-weave':
            return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">` +
                `<line x1="0" y1="${h}" x2="${s}" y2="${h}" stroke="${stroke}" stroke-opacity="${op}" stroke-width="0.9"/>` +
                `<line x1="${h}" y1="0" x2="${h}" y2="${s}" stroke="${stroke}" stroke-opacity="${soft}" stroke-width="0.9"/></svg>`;
        case 'hex-mesh': {
            const q = (s * 0.25).toFixed(2);
            const tq = (s * 0.75).toFixed(2);
            return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">` +
                `<polygon points="${h},1 ${s - 1},${q} ${s - 1},${tq} ${h},${s - 1} 1,${tq} 1,${q}" fill="none" stroke="${stroke}" stroke-opacity="${op}" stroke-width="1"/></svg>`;
        }
        default:
            return '';
    }
}

/**
 * Build a CSP-safe SVG data URL wrapped in CSS url("...") for an allowlisted procedural texture.
 * @returns {string} CSS background-image value (`none` or `url("data:image/svg+xml,...")`)
 */
export function buildProceduralTextureUrl(textureId, colorHex = '#94a3b8', opacity = 0.16, scalePx = 32) {
    const id = VALID_TEXTURE_IDS.has(textureId) ? textureId : 'none';
    if (id === 'none') return 'none';
    const safeHex = safeColor(colorHex);
    const op = clampNum(opacity, 0, 1, 0.16);
    if (op <= 0.001) return 'none';
    const size = Math.round(clampNum(scalePx, 10, 192, 32));
    const cacheKey = `${id}|${safeHex}|${op.toFixed(3)}|${size}`;
    if (URL_CACHE.has(cacheKey)) {
        const hit = URL_CACHE.get(cacheKey);
        URL_CACHE.delete(cacheKey);
        URL_CACHE.set(cacheKey, hit);
        return hit;
    }
    const rawSvg = svgMarkup(id, safeHex, op, size);
    if (!rawSvg) return 'none';
    const encoded = `url("data:image/svg+xml,${encodeURIComponent(rawSvg)}")`;
    URL_CACHE.set(cacheKey, encoded);
    while (URL_CACHE.size > MAX_URL_CACHE) {
        const oldest = URL_CACHE.keys().next().value;
        URL_CACHE.delete(oldest);
    }
    return encoded;
}
