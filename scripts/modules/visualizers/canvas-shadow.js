import { isFirefox, isMobileDevice } from '../utils.js';

// Limit shadow rasterization on our own visualizers, not on every canvas
// in the document. Canvas save/restore retains its native behavior.
export function setCanvasShadowBlur(ctx, requested) {
    const blur = Number.isFinite(requested) ? Math.max(0, requested) : 0;
    ctx.shadowBlur = isFirefox || isMobileDevice ? 0 : Math.min(blur, 3);
}
