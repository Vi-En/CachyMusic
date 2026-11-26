/**
 * Zero-DOM OKLCH <-> sRGB math, WCAG 2.2 luminance & contrast auditor,
 * and deterministic OKLCH lightness solver preserving Hue and Chroma.
 */

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

function linToSrgbChannel(c) {
    const v = clamp01(c);
    return v <= 0.0031308 ? 12.92 * v : 1.055 * (v ** (1 / 2.4)) - 0.055;
}

function srgbToLinChannel(c) {
    const v = clamp01(c);
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

/**
 * Parse #RGB, #RRGGBB, or #RRGGBBAA into normalized { r, g, b, a } in [0..1].
 */
export function hexToSrgb(hex) {
    if (typeof hex !== 'string') return null;
    const raw = hex.trim().replace(/^#/, '');
    if (/^[0-9a-f]{3}$/i.test(raw)) {
        return {
            r: parseInt(raw[0] + raw[0], 16) / 255,
            g: parseInt(raw[1] + raw[1], 16) / 255,
            b: parseInt(raw[2] + raw[2], 16) / 255,
            a: 1
        };
    }
    if (/^[0-9a-f]{6}$/i.test(raw)) {
        return {
            r: parseInt(raw.slice(0, 2), 16) / 255,
            g: parseInt(raw.slice(2, 4), 16) / 255,
            b: parseInt(raw.slice(4, 6), 16) / 255,
            a: 1
        };
    }
    if (/^[0-9a-f]{8}$/i.test(raw)) {
        return {
            r: parseInt(raw.slice(0, 2), 16) / 255,
            g: parseInt(raw.slice(2, 4), 16) / 255,
            b: parseInt(raw.slice(4, 6), 16) / 255,
            a: parseInt(raw.slice(6, 8), 16) / 255
        };
    }
    return null;
}

/**
 * Format sRGB [0..1] object to lowercase #rrggbb hex.
 */
export function srgbToHex(rgb) {
    const toByte = (v) => Math.round(clamp01(v) * 255).toString(16).padStart(2, '0');
    return `#${toByte(rgb.r)}${toByte(rgb.g)}${toByte(rgb.b)}`;
}

/**
 * Convert OKLCH (L in 0..1, C >= 0, H in degrees) into gamut-clamped gamma sRGB [0..1].
 */
export function oklchToSrgb(L, C, H, alpha = 1) {
    const hRad = (Number(H) || 0) * (Math.PI / 180);
    const a = (Number(C) || 0) * Math.cos(hRad);
    const b = (Number(C) || 0) * Math.sin(hRad);
    const l_ = Number(L) + 0.3963377774 * a + 0.2158037573 * b;
    const m_ = Number(L) - 0.1055613458 * a - 0.0638541728 * b;
    const s_ = Number(L) - 0.0894841775 * a - 1.2914855480 * b;
    const l = l_ * l_ * l_;
    const m = m_ * m_ * m_;
    const s = s_ * s_ * s_;
    const linR = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
    const linG = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
    const linB = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
    return {
        r: linToSrgbChannel(linR),
        g: linToSrgbChannel(linG),
        b: linToSrgbChannel(linB),
        a: clamp01(alpha)
    };
}

/**
 * Convert gamma sRGB [0..1] to OKLCH { L, C, H }.
 */
export function srgbToOklch(r, g, b) {
    const lr = srgbToLinChannel(r);
    const lg = srgbToLinChannel(g);
    const lb = srgbToLinChannel(b);
    const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
    const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
    const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);

    const L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
    const a = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
    const bk = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
    const C = Math.hypot(a, bk);
    let H = Math.atan2(bk, a) * (180 / Math.PI);
    if (H < 0) H += 360;
    return { L: clamp01(L), C, H: C < 1e-5 ? 0 : H };
}

/**
 * Parse hex, rgb()/rgba(), or oklch() color strings to normalized gamma sRGB { r, g, b, a }.
 */
export function parseColor(str) {
    if (typeof str !== 'string') return null;
    const s = str.trim();
    if (s.startsWith('#')) return hexToSrgb(s);

    const rgbMatch = /^rgba?\(\s*([0-9.]+)\s*[,\s]\s*([0-9.]+)\s*[,\s]\s*([0-9.]+)(?:\s*[,/]\s*([0-9.]+%?))?\s*\)$/i.exec(s);
    if (rgbMatch) {
        let a = 1;
        if (rgbMatch[4] !== undefined) {
            a = rgbMatch[4].endsWith('%') ? parseFloat(rgbMatch[4]) / 100 : parseFloat(rgbMatch[4]);
        }
        return {
            r: clamp01(parseFloat(rgbMatch[1]) / 255),
            g: clamp01(parseFloat(rgbMatch[2]) / 255),
            b: clamp01(parseFloat(rgbMatch[3]) / 255),
            a: clamp01(Number.isFinite(a) ? a : 1)
        };
    }

    const okMatch = /^oklch\(\s*([0-9.]+%?)\s+([0-9.]+)\s+([0-9.]+)(?:deg)?(?:\s*\/\s*([0-9.]+%?))?\s*\)$/i.exec(s);
    if (okMatch) {
        let L = okMatch[1].endsWith('%') ? parseFloat(okMatch[1]) / 100 : parseFloat(okMatch[1]);
        let a = 1;
        if (okMatch[4] !== undefined) {
            a = okMatch[4].endsWith('%') ? parseFloat(okMatch[4]) / 100 : parseFloat(okMatch[4]);
        }
        return oklchToSrgb(L, parseFloat(okMatch[2]), parseFloat(okMatch[3]), Number.isFinite(a) ? a : 1);
    }

    return null;
}

/**
 * Composite gamma sRGB foreground over opaque background in sRGB space.
 */
export function compositeOver(fgSrgb, alpha, bgSrgb) {
    const a = clamp01(alpha !== undefined ? alpha : (fgSrgb.a ?? 1));
    return {
        r: fgSrgb.r * a + bgSrgb.r * (1 - a),
        g: fgSrgb.g * a + bgSrgb.g * (1 - a),
        b: fgSrgb.b * a + bgSrgb.b * (1 - a),
        a: 1
    };
}

/**
 * WCAG 2.2 relative luminance of a gamma sRGB color [0..1].
 */
export function relativeLuminance(srgb) {
    const r = srgbToLinChannel(srgb.r);
    const g = srgbToLinChannel(srgb.g);
    const b = srgbToLinChannel(srgb.b);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * WCAG 2.2 contrast ratio between two opaque/resolved sRGB colors or color strings.
 */
export function contrastRatio(c1, c2) {
    const a = typeof c1 === 'string' ? parseColor(c1) : c1;
    const b = typeof c2 === 'string' ? parseColor(c2) : c2;
    if (!a || !b) return 1;
    const l1 = relativeLuminance(a);
    const l2 = relativeLuminance(b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

function resolveColorOver(input, backdropSrgb) {
    const parsed = typeof input === 'string' ? parseColor(input) : input;
    if (!parsed) return backdropSrgb;
    if ((parsed.a ?? 1) < 1 && backdropSrgb) {
        return compositeOver(parsed, parsed.a, backdropSrgb);
    }
    return parsed;
}

/**
 * Audit 3-plane palette (BG / MG / FG / Borders / Accent) against WCAG 2.2 AA & AAA.
 */
export function auditThemeContrast(palette = {}) {
    const bgCanvas = (typeof palette.bgCanvas === 'object' && palette.bgCanvas !== null && Number.isFinite(palette.bgCanvas.r))
        ? { r: clamp01(palette.bgCanvas.r), g: clamp01(palette.bgCanvas.g), b: clamp01(palette.bgCanvas.b), a: 1 }
        : (parseColor(palette.bgCanvas || '#090e14') || { r: 0.035, g: 0.055, b: 0.078, a: 1 });
    const surfaceOpacity = clamp01(palette.surfaceOpacity ?? 1);
    const s1Raw = resolveColorOver(palette.surface1 || '#111a24', bgCanvas);
    const s1 = surfaceOpacity < 1 ? compositeOver(s1Raw, surfaceOpacity, bgCanvas) : s1Raw;
    const s2 = resolveColorOver(palette.surface2 || '#192634', s1);

    const textPrimary = resolveColorOver(palette.textPrimary || '#f1f5f9', s1);
    const textSecondary = resolveColorOver(palette.textSecondary || '#cbd5e1', s1);
    const textMuted = resolveColorOver(palette.textMuted || '#94a3b8', s2);
    const accent = resolveColorOver(palette.accent || '#38bdf8', s1);
    const textOnAccent = resolveColorOver(palette.textOnAccent || '#041018', accent);
    const borderControl = resolveColorOver(palette.borderControl || '#64748b', s1);
    const borderFocus = resolveColorOver(palette.borderFocus || accent, s1);

    const lBg = srgbToOklch(bgCanvas.r, bgCanvas.g, bgCanvas.b).L;
    const lS1 = srgbToOklch(s1.r, s1.g, s1.b).L;
    const planeDeltaL = Math.abs(lS1 - lBg);
    const bgToSurface1Ratio = contrastRatio(bgCanvas, s1);

    const metrics = {
        primaryTextOnBg: Number(contrastRatio(textPrimary, bgCanvas).toFixed(2)),
        primaryTextOnSurface1: Number(contrastRatio(textPrimary, s1).toFixed(2)),
        secondaryTextOnSurface1: Number(contrastRatio(textSecondary, s1).toFixed(2)),
        mutedTextOnSurface1: Number(contrastRatio(textMuted, s1).toFixed(2)),
        mutedTextOnSurface2: Number(contrastRatio(textMuted, s2).toFixed(2)),
        textOnAccent: Number(contrastRatio(textOnAccent, accent).toFixed(2)),
        accentOnSurface1: Number(contrastRatio(accent, s1).toFixed(2)),
        controlBorderOnSurface1: Number(contrastRatio(borderControl, s1).toFixed(2)),
        controlBorderOnSurface2: Number(contrastRatio(borderControl, s2).toFixed(2)),
        focusBorderOnSurface1: Number(contrastRatio(borderFocus, s1).toFixed(2)),
        bgToSurface1Ratio: Number(bgToSurface1Ratio.toFixed(2)),
        planeDeltaL: Number(planeDeltaL.toFixed(3))
    };

    const checks = {
        primaryText: metrics.primaryTextOnBg >= 4.5 && metrics.primaryTextOnSurface1 >= 4.5,
        primaryTextAAA: metrics.primaryTextOnBg >= 7.0 && metrics.primaryTextOnSurface1 >= 7.0,
        secondaryText: metrics.secondaryTextOnSurface1 >= 4.5,
        mutedText: metrics.mutedTextOnSurface1 >= 4.5 && metrics.mutedTextOnSurface2 >= 4.5,
        onAccent: metrics.textOnAccent >= 4.5,
        controlBorder: metrics.controlBorderOnSurface1 >= 3.0 && metrics.controlBorderOnSurface2 >= 3.0,
        focusBorder: metrics.focusBorderOnSurface1 >= 4.5,
        planeSeparation: planeDeltaL >= 0.025 || bgToSurface1Ratio >= 1.12
    };

    const allPass = checks.primaryText && checks.secondaryText && checks.mutedText
        && checks.onAccent && checks.controlBorder && checks.focusBorder;

    return { metrics, checks, allPass };
}

/**
 * Deterministically adjust color lightness in OKLCH space to reach minimum contrast ratio
 * against one or two reference surfaces while preserving Hue and scaling Chroma near bounds.
 */
export function solveContrastLightness(fgHex, refs, minRatio, preferLighter = null) {
    const base = parseColor(fgHex) || { r: 0.5, g: 0.5, b: 0.5, a: 1 };
    const refList = (Array.isArray(refs) ? refs : [refs]).map(r => (typeof r === 'string' ? parseColor(r) : r)).filter(Boolean);
    if (refList.length === 0) return srgbToHex(base);

    const passesAll = (rgb) => refList.every(bg => contrastRatio(rgb, bg) >= minRatio);
    if (passesAll(base)) return srgbToHex(base);

    const ok = srgbToOklch(base.r, base.g, base.b);
    const avgRefLum = refList.reduce((acc, c) => acc + relativeLuminance(c), 0) / refList.length;
    const dirLight = preferLighter !== null ? preferLighter : (avgRefLum < 0.35);

    const candidateAt = (L) => {
        const edgeFactor = L > 0.92 ? (1 - L) / 0.08 : (L < 0.08 ? L / 0.08 : 1);
        return oklchToSrgb(L, ok.C * clamp01(edgeFactor), ok.H);
    };

    const searchDirection = (goLighter) => {
        const endpoint = candidateAt(goLighter ? 1 : 0);
        if (!passesAll(endpoint)) return null;
        let lo = goLighter ? ok.L : 0;
        let hi = goLighter ? 1 : ok.L;
        for (let step = 0; step < 20; step++) {
            const mid = (lo + hi) * 0.5;
            const rgb = candidateAt(mid);
            if (passesAll(rgb)) {
                if (goLighter) hi = mid;
                else lo = mid;
            } else {
                if (goLighter) lo = mid;
                else hi = mid;
            }
        }
        return candidateAt(goLighter ? hi : lo);
    };

    const primaryTry = searchDirection(dirLight);
    if (primaryTry) return srgbToHex(primaryTry);
    const fallbackTry = searchDirection(!dirLight);
    if (fallbackTry) return srgbToHex(fallbackTry);
    return avgRefLum < 0.35 ? '#ffffff' : '#000000';
}

/**
 * Solve and repair FG/MG/BG contrast issues on a custom theme configuration without mutating caller object.
 */
export function autoFixThemeContrast(themeConfig) {
    const next = structuredClone(themeConfig);
    const c = next.colors;
    const isLight = next.mode === 'light';

    // 1. Ensure clear Background <-> Middleground plane separation
    const bgRgb = parseColor(c.bgCanvas);
    let s1Rgb = parseColor(c.surface1);
    let s2Rgb = parseColor(c.surface2);
    let s3Rgb = parseColor(c.surface3);
    const okBg = srgbToOklch(bgRgb.r, bgRgb.g, bgRgb.b);
    const okS1 = srgbToOklch(s1Rgb.r, s1Rgb.g, s1Rgb.b);
    const minDeltaS1 = isLight ? 0.035 : 0.065;
    if (Math.abs(okS1.L - okBg.L) < minDeltaS1) {
        const targetL1 = isLight ? Math.max(0.86, okBg.L - minDeltaS1) : Math.min(0.28, okBg.L + minDeltaS1);
        c.surface1 = srgbToHex(oklchToSrgb(targetL1, okS1.C, okS1.H));
        s1Rgb = parseColor(c.surface1);
    }

    const okS1Fixed = srgbToOklch(s1Rgb.r, s1Rgb.g, s1Rgb.b);
    const okS2 = srgbToOklch(s2Rgb.r, s2Rgb.g, s2Rgb.b);
    const minDeltaS2 = isLight ? 0.03 : 0.04;
    if (Math.abs(okS2.L - okS1Fixed.L) < minDeltaS2) {
        const targetL2 = isLight ? Math.max(0.80, okS1Fixed.L - minDeltaS2) : Math.min(0.36, okS1Fixed.L + minDeltaS2);
        c.surface2 = srgbToHex(oklchToSrgb(targetL2, okS2.C, okS2.H));
        s2Rgb = parseColor(c.surface2);
    }

    const okS2Fixed = srgbToOklch(s2Rgb.r, s2Rgb.g, s2Rgb.b);
    const okS3 = srgbToOklch(s3Rgb.r, s3Rgb.g, s3Rgb.b);
    if (Math.abs(okS3.L - okS2Fixed.L) < 0.03) {
        const targetL3 = isLight ? Math.max(0.74, okS2Fixed.L - 0.035) : Math.min(0.44, okS2Fixed.L + 0.04);
        c.surface3 = srgbToHex(oklchToSrgb(targetL3, okS3.C, okS3.H));
    }

    const surfOpacity = clamp01(next.geometry?.surfaceOpacity ?? 1);
    const effectiveS1 = surfOpacity < 1 ? compositeOver(s1Rgb, surfOpacity, bgRgb) : s1Rgb;
    const effectiveS2 = compositeOver(s2Rgb, 1, effectiveS1);
    const preferLightText = !isLight;

    // 2. Fix Foreground text hierarchy against both BG and Middleground
    c.textPrimary = solveContrastLightness(c.textPrimary, [bgRgb, effectiveS1, effectiveS2], 7.1, preferLightText);
    c.textSecondary = solveContrastLightness(c.textSecondary, [bgRgb, effectiveS1, effectiveS2], 4.8, preferLightText);
    c.textMuted = solveContrastLightness(c.textMuted, [bgRgb, effectiveS1, effectiveS2], 4.65, preferLightText);

    // 3. Fix Accent & On-Accent
    c.accent = solveContrastLightness(c.accent, [bgRgb, effectiveS1], 4.5, preferLightText);
    const accentRgb = parseColor(c.accent);
    const accentLum = relativeLuminance(accentRgb);
    c.textOnAccent = solveContrastLightness(c.textOnAccent, [accentRgb], 4.7, accentLum < 0.35);

    // 4. Fix WCAG 2.2 1.4.11 UI Boundaries & 2.4.13 Focus Ring
    c.borderControl = solveContrastLightness(c.borderControl, [bgRgb, effectiveS1, effectiveS2], 3.2, preferLightText);
    c.borderSurface = solveContrastLightness(c.borderSurface || c.borderControl, [bgRgb, effectiveS1], 1.65, preferLightText);
    c.borderDivider = solveContrastLightness(c.borderDivider || c.borderControl, [effectiveS1, effectiveS2], 1.55, preferLightText);
    c.borderFocus = solveContrastLightness(c.borderFocus || c.accent, [bgRgb, effectiveS1, effectiveS2], 4.7, preferLightText);

    // 5. Protect text legibility over custom image/texture backgrounds via scrim floor
    if (next.backgrounds) {
        for (const scopeKey of ['canvas', 'panels', 'stage', 'chrome']) {
            const bg = next.backgrounds[scopeKey];
            if (bg && (bg.mode === 'image' || (bg.mode === 'texture' && bg.textureId !== 'none'))) {
                bg.scrimOpacity = Math.max(bg.scrimOpacity ?? 0, scopeKey === 'panels' ? 0.68 : 0.55);
                if (!bg.scrimColor) {
                    bg.scrimColor = isLight ? '#faf8f5' : '#080b10';
                }
            }
        }
    }

    return next;
}
