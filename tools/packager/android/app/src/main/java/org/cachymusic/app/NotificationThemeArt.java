package org.cachymusic.app;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.graphics.Shader;
import java.util.Collections;
import java.util.HashMap;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Generates theme-matched fallback artwork and palette specs for Android media notifications
 * across all 12 built-in CachyMusic themes and validated user custom themes.
 */
public final class NotificationThemeArt {
    public static final class ThemeSpec {
        public final String id;
        public final int bgColor;
        public final int surfaceColor;
        public final int accentColor;
        public final int secondaryColor;
        public final boolean isLiquid;
        public final boolean isLight;

        ThemeSpec(String id, int bgColor, int surfaceColor, int accentColor,
                int secondaryColor, boolean isLiquid, boolean isLight) {
            this.id = id;
            this.bgColor = bgColor;
            this.surfaceColor = surfaceColor;
            this.accentColor = accentColor;
            this.secondaryColor = secondaryColor;
            this.isLiquid = isLiquid;
            this.isLight = isLight;
        }
    }

    private static final Map<String, ThemeSpec> SPECS;
    private static final Map<String, String> ALIASES;
    private static final float[] SEGMENT_PROFILE = {
            0.34f, 0.56f, 0.78f, 0.92f, 0.68f, 0.48f,
            0.84f, 0.96f, 0.72f, 0.54f, 0.64f, 0.38f
    };

    private static final Pattern HEX_FIELD_BG = Pattern.compile("\"bg\"\\s*:\\s*\"(#(?:[0-9a-fA-F]{6}))\"");
    private static final Pattern HEX_FIELD_SURFACE = Pattern.compile("\"surface\"\\s*:\\s*\"(#(?:[0-9a-fA-F]{6}))\"");
    private static final Pattern HEX_FIELD_ACCENT = Pattern.compile("\"accent\"\\s*:\\s*\"(#(?:[0-9a-fA-F]{6}))\"");
    private static final Pattern HEX_FIELD_SECONDARY = Pattern.compile("\"secondary\"\\s*:\\s*\"(#(?:[0-9a-fA-F]{6}))\"");
    private static final Pattern BOOL_FIELD_LIQUID = Pattern.compile("\"liquid\"\\s*:\\s*(true|false)");
    private static final Pattern BOOL_FIELD_LIGHT = Pattern.compile("\"light\"\\s*:\\s*(true|false)");

    static {
        Map<String, ThemeSpec> m = new HashMap<>();
        m.put("default", new ThemeSpec("default", 0xFF090E14, 0xFF13202E, 0xFF38BDF8, 0xFF94A3B8, false, false));
        m.put("carbon-signal", new ThemeSpec("carbon-signal", 0xFF0B0F12, 0xFF12181D, 0xFF4FD1C5, 0xFFB7C4CA, false, false));
        m.put("paper-sonata", new ThemeSpec("paper-sonata", 0xFFF6F1E7, 0xFFEDE5D7, 0xFF8B2F3C, 0xFF5E554B, false, true));
        m.put("blue-note-console", new ThemeSpec("blue-note-console", 0xFF07111F, 0xFF0D1C2D, 0xFF7CC4FF, 0xFFB7C9DE, false, false));
        m.put("copper-reel", new ThemeSpec("copper-reel", 0xFF18120F, 0xFF241A15, 0xFFE8A06B, 0xFFD8C2B0, true, false));
        m.put("orchid-matrix", new ThemeSpec("orchid-matrix", 0xFF100D16, 0xFF191421, 0xFFD0A2FF, 0xFFC9BBDD, true, false));
        m.put("nms", new ThemeSpec("nms", 0xFF15080A, 0xFF281016, 0xFFFF2A55, 0xFF00E5FF, true, false));
        m.put("solar-eclipse", new ThemeSpec("solar-eclipse", 0xFF0A0B1A, 0xFF161938, 0xFF38D9FF, 0xFFA855F7, true, false));
        m.put("euclid-horizon", new ThemeSpec("euclid-horizon", 0xFF120E09, 0xFF251D13, 0xFFF59E0B, 0xFFFBBF24, false, false));
        m.put("alien-paradise", new ThemeSpec("alien-paradise", 0xFF140912, 0xFF291224, 0xFFFF4DA6, 0xFF2DD4BF, true, false));
        m.put("abyssal-void", new ThemeSpec("abyssal-void", 0xFF06140F, 0xFF0C281F, 0xFF10F5A8, 0xFF0EA5E9, true, false));
        m.put("dissonance", new ThemeSpec("dissonance", 0xFF12081C, 0xFF241136, 0xFFC084FC, 0xFFF472B6, true, false));
        m.put("sentinel", new ThemeSpec("sentinel", 0xFF09111A, 0xFF132334, 0xFF00E5FF, 0xFFF97316, false, false));
        m.put("minimalist-light", new ThemeSpec("minimalist-light", 0xFFF4F3EF, 0xFFE5E3DC, 0xFF111827, 0xFF6B7280, false, true));
        m.put("minimalist-dark", new ThemeSpec("minimalist-dark", 0xFF080808, 0xFF181818, 0xFFF3F4F6, 0xFF9CA3AF, false, false));
        m.put("minimalist-warm", new ThemeSpec("minimalist-warm", 0xFFFAF8F5, 0xFFEFE9DF, 0xFF9A3412, 0xFFD97706, true, true));
        m.put("minimalist-obsidian", new ThemeSpec("minimalist-obsidian", 0xFF000000, 0xFF0B141A, 0xFF22D3EE, 0xFF38BDF8, false, false));
        SPECS = Collections.unmodifiableMap(m);

        Map<String, String> a = new HashMap<>();
        a.put("atlas", "nms");
        a.put("spotify", "nms");
        a.put("apple", "nms");
        a.put("studio-dark", "default");
        a.put("cyberpunk", "solar-eclipse");
        a.put("neon-night", "solar-eclipse");
        a.put("brutalist-minimalism-light", "minimalist-light");
        a.put("brutalist-light", "minimalist-light");
        a.put("brutalist-minimalism-dark", "minimalist-dark");
        a.put("brutalist-dark", "minimalist-dark");
        a.put("midnight-amoled", "minimalist-obsidian");
        ALIASES = Collections.unmodifiableMap(a);
    }

    private NotificationThemeArt() {}

    public static ThemeSpec customSpec(int bgColor, int surfaceColor, int accentColor,
            int secondaryColor, boolean isLiquid, boolean isLight) {
        return new ThemeSpec("custom", bgColor, surfaceColor, accentColor, secondaryColor, isLiquid, isLight);
    }

    private static int parseHex6(String hex, int fallback) {
        if (hex == null || hex.length() != 7 || hex.charAt(0) != '#') return fallback;
        try {
            return 0xFF000000 | Integer.parseInt(hex.substring(1), 16);
        } catch (NumberFormatException e) {
            return fallback;
        }
    }

    public static ThemeSpec parseCustomPaletteJson(String json) {
        if (json == null || json.isEmpty() || json.length() > 1024) {
            return SPECS.get("default");
        }
        Matcher mBg = HEX_FIELD_BG.matcher(json);
        Matcher mSurf = HEX_FIELD_SURFACE.matcher(json);
        Matcher mAcc = HEX_FIELD_ACCENT.matcher(json);
        Matcher mSec = HEX_FIELD_SECONDARY.matcher(json);
        if (!mBg.find() || !mSurf.find() || !mAcc.find()) {
            return SPECS.get("default");
        }
        int bg = parseHex6(mBg.group(1), 0xFF090E14);
        int surface = parseHex6(mSurf.group(1), 0xFF13202E);
        int accent = parseHex6(mAcc.group(1), 0xFF38BDF8);
        int secondary = mSec.find() ? parseHex6(mSec.group(1), accent) : accent;

        Matcher mLiq = BOOL_FIELD_LIQUID.matcher(json);
        boolean isLiquid = mLiq.find() && "true".equals(mLiq.group(1));
        Matcher mLight = BOOL_FIELD_LIGHT.matcher(json);
        boolean isLight = mLight.find() && "true".equals(mLight.group(1));

        return customSpec(bg, surface, accent, secondary, isLiquid, isLight);
    }

    public static ThemeSpec specFor(String themeId) {
        if (themeId == null) return SPECS.get("default");
        String resolved = ALIASES.getOrDefault(themeId, themeId);
        ThemeSpec spec = SPECS.get(resolved);
        return spec != null ? spec : SPECS.get("default");
    }

    public static ThemeSpec resolveSpec(String themeId, String customPaletteJson) {
        if ("custom".equals(themeId)) {
            return parseCustomPaletteJson(customPaletteJson);
        }
        return specFor(themeId);
    }

    private static int withAlpha(int color, int alpha) {
        return Color.argb(Math.max(0, Math.min(255, alpha)),
                Color.red(color), Color.green(color), Color.blue(color));
    }

    public static Bitmap renderFallbackCover(String themeId, int sizePx) {
        return renderFallbackCover(specFor(themeId), sizePx);
    }

    public static Bitmap renderFallbackCover(ThemeSpec spec, int sizePx) {
        if (spec == null) spec = SPECS.get("default");
        int size = Math.max(64, Math.min(512, sizePx));
        Bitmap bmp = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bmp);

        Paint bgPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        bgPaint.setShader(new LinearGradient(0f, 0f, 0f, size,
                spec.bgColor, spec.surfaceColor, Shader.TileMode.CLAMP));
        canvas.drawRect(0f, 0f, size, size, bgPaint);

        // Subtle central vinyl/platter emblem matching theme accent
        float cx = size * 0.5f;
        float cy = size * 0.41f;
        float radius = size * 0.24f;
        Paint ringPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        ringPaint.setStyle(Paint.Style.STROKE);
        ringPaint.setStrokeWidth(Math.max(2f, size * 0.015f));
        ringPaint.setColor(withAlpha(spec.accentColor, spec.isLight ? 140 : 120));
        canvas.drawCircle(cx, cy, radius, ringPaint);

        ringPaint.setStrokeWidth(Math.max(1.5f, size * 0.008f));
        ringPaint.setColor(withAlpha(spec.secondaryColor, 90));
        canvas.drawCircle(cx, cy, radius * 0.62f, ringPaint);

        Paint spindlePaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        spindlePaint.setStyle(Paint.Style.FILL);
        spindlePaint.setColor(withAlpha(spec.accentColor, 200));
        canvas.drawCircle(cx, cy, Math.max(3f, size * 0.03f), spindlePaint);

        if (spec.isLiquid) {
            drawLiquidBand(canvas, size, spec);
        } else {
            drawSegmentedBand(canvas, size, spec);
        }
        return bmp;
    }

    private static void drawSegmentedBand(Canvas canvas, int size, ThemeSpec spec) {
        int cols = SEGMENT_PROFILE.length;
        int segments = 6;
        float padX = size * 0.10f;
        float bandBottom = size * 0.90f;
        float bandHeight = size * 0.23f;
        float colStep = (size - padX * 2f) / cols;
        float barW = Math.max(3f, colStep * 0.68f);
        float segGap = Math.max(2f, bandHeight * 0.055f);
        float segH = Math.max(2f, (bandHeight - (segments - 1) * segGap) / segments);
        float corner = Math.max(1f, size * 0.006f);

        Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG);
        RectF rect = new RectF();
        for (int c = 0; c < cols; c++) {
            float x = padX + c * colStep + (colStep - barW) * 0.5f;
            int lit = Math.max(1, Math.round(SEGMENT_PROFILE[c] * segments));
            for (int s = 0; s < lit; s++) {
                float bottom = bandBottom - s * (segH + segGap);
                float top = bottom - segH;
                fill.setColor(s >= segments - 1
                        ? spec.secondaryColor
                        : withAlpha(spec.accentColor, 185 + (s * 12)));
                rect.set(x, top, x + barW, bottom);
                canvas.drawRoundRect(rect, corner, corner, fill);
            }
        }
    }

    private static void drawLiquidBand(Canvas canvas, int size, ThemeSpec spec) {
        float base = size;
        float topY = size * 0.68f;
        Paint undertow = new Paint(Paint.ANTI_ALIAS_FLAG);
        undertow.setStyle(Paint.Style.FILL);
        undertow.setColor(withAlpha(spec.secondaryColor, 95));

        Path back = new Path();
        back.moveTo(0f, base);
        back.lineTo(0f, size * 0.80f);
        back.quadTo(size * 0.25f, size * 0.70f, size * 0.50f, size * 0.77f);
        back.quadTo(size * 0.75f, size * 0.84f, size, size * 0.72f);
        back.lineTo(size, base);
        back.close();
        canvas.drawPath(back, undertow);

        Paint frontPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        frontPaint.setStyle(Paint.Style.FILL);
        frontPaint.setShader(new LinearGradient(0f, topY, 0f, base,
                withAlpha(spec.accentColor, 200), withAlpha(spec.secondaryColor, 120),
                Shader.TileMode.CLAMP));

        Path front = new Path();
        front.moveTo(0f, base);
        front.lineTo(0f, size * 0.83f);
        front.quadTo(size * 0.28f, size * 0.88f, size * 0.55f, size * 0.74f);
        front.quadTo(size * 0.80f, size * 0.64f, size, size * 0.79f);
        front.lineTo(size, base);
        front.close();
        canvas.drawPath(front, frontPaint);

        Paint crest = new Paint(Paint.ANTI_ALIAS_FLAG);
        crest.setStyle(Paint.Style.STROKE);
        crest.setStrokeWidth(Math.max(2f, size * 0.012f));
        crest.setColor(spec.accentColor);
        Path line = new Path();
        line.moveTo(0f, size * 0.83f);
        line.quadTo(size * 0.28f, size * 0.88f, size * 0.55f, size * 0.74f);
        line.quadTo(size * 0.80f, size * 0.64f, size, size * 0.79f);
        canvas.drawPath(line, crest);
    }
}
