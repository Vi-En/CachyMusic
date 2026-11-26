from pathlib import Path
import json
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
JAVA_SRC = ROOT / "tools/packager/android/app/src/main/java/org/cachymusic/app/NotificationThemeArt.java"

STUBS = """
package android.graphics;
public final class Color {
    public static int argb(int a, int r, int g, int b) {
        return ((a & 0xFF) << 24) | ((r & 0xFF) << 16) | ((g & 0xFF) << 8) | (b & 0xFF);
    }
    public static int red(int c) { return (c >>> 16) & 0xFF; }
    public static int green(int c) { return (c >>> 8) & 0xFF; }
    public static int blue(int c) { return c & 0xFF; }
}
"""

BITMAP_STUB = """
package android.graphics;
public final class Bitmap {
    public enum Config { ARGB_8888 }
    private final int w, h;
    private Bitmap(int w, int h) { this.w = w; this.h = h; }
    public static Bitmap createBitmap(int w, int h, Config c) { return new Bitmap(w, h); }
    public int getWidth() { return w; }
    public int getHeight() { return h; }
}
"""

CANVAS_STUB = """
package android.graphics;
public class Canvas {
    public int rects = 0, circles = 0, roundRects = 0, paths = 0;
    public Canvas(Bitmap b) {}
    public void drawRect(float l, float t, float r, float b, Paint p) { rects++; }
    public void drawCircle(float cx, float cy, float radius, Paint p) { circles++; }
    public void drawRoundRect(RectF r, float rx, float ry, Paint p) { roundRects++; }
    public void drawPath(Path p, Paint paint) { paths++; }
}
"""

PAINT_STUB = """
package android.graphics;
public class Paint {
    public static final int ANTI_ALIAS_FLAG = 1;
    public enum Style { FILL, STROKE }
    public Paint(int flags) {}
    public void setShader(Shader s) {}
    public void setStyle(Style s) {}
    public void setStrokeWidth(float w) {}
    public void setColor(int c) {}
}
"""

PATH_STUB = """
package android.graphics;
public class Path {
    public void moveTo(float x, float y) {}
    public void lineTo(float x, float y) {}
    public void quadTo(float x1, float y1, float x2, float y2) {}
    public void close() {}
}
"""

RECTF_STUB = """
package android.graphics;
public class RectF {
    public void set(float l, float t, float r, float b) {}
}
"""

SHADER_STUB = """
package android.graphics;
public class Shader {
    public enum TileMode { CLAMP }
}
"""

GRAD_STUB = """
package android.graphics;
public class LinearGradient extends Shader {
    public LinearGradient(float x0, float y0, float x1, float y1, int c0, int c1, TileMode m) {}
}
"""

HARNESS = """
import org.cachymusic.app.NotificationThemeArt;
import android.graphics.Bitmap;

public class ThemeArtTest {
    public static void main(String[] args) {
        String[] ids = {
            "default", "nms", "solar-eclipse", "euclid-horizon",
            "alien-paradise", "abyssal-void", "dissonance", "sentinel",
            "minimalist-light", "minimalist-dark", "minimalist-warm", "minimalist-obsidian"
        };
        for (String id : ids) {
            NotificationThemeArt.ThemeSpec spec = NotificationThemeArt.specFor(id);
            if (!id.equals(spec.id)) throw new AssertionError("ID mismatch: " + id);
            Bitmap bmp = NotificationThemeArt.renderFallbackCover(id, 256);
            if (bmp.getWidth() != 256 || bmp.getHeight() != 256) throw new AssertionError("Size mismatch");
            System.out.println(spec.id + "|" + (spec.isLiquid ? "liquid" : "segmented") + "|" + spec.isLight);
        }
        if (!"nms".equals(NotificationThemeArt.specFor("atlas").id)) throw new AssertionError("Alias failed");
        if (!"default".equals(NotificationThemeArt.specFor(null).id)) throw new AssertionError("Null failed");
        if (!"default".equals(NotificationThemeArt.specFor("bogus").id)) throw new AssertionError("Unknown failed");
        if (NotificationThemeArt.renderFallbackCover("default", 16).getWidth() != 64) throw new AssertionError("Min clamp failed");

        String customJson = "{\\"bg\\":\\"#112233\\",\\"surface\\":\\"#223344\\",\\"accent\\":\\"#ff5500\\",\\"secondary\\":\\"#00ccff\\",\\"liquid\\":true,\\"light\\":false}";
        NotificationThemeArt.ThemeSpec custom = NotificationThemeArt.resolveSpec("custom", customJson);
        if (!"custom".equals(custom.id) || !custom.isLiquid || custom.isLight) throw new AssertionError("Custom spec parse failed");
        if (NotificationThemeArt.renderFallbackCover(custom, 256).getWidth() != 256) throw new AssertionError("Custom fallback cover failed");
        NotificationThemeArt.ThemeSpec badCustom = NotificationThemeArt.resolveSpec("custom", "{malformed}");
        if (!"default".equals(badCustom.id)) throw new AssertionError("Malformed custom palette must fall back to default");
    }
}
"""

js_profiles = json.loads(subprocess.check_output([
    "node", "--input-type=module", "-e",
    "import {VALID_THEME_IDS, getThemeNotificationProfile} from './scripts/modules/theme-catalog.js';"
    "console.log(JSON.stringify(Object.fromEntries(VALID_THEME_IDS.map(id => [id, getThemeNotificationProfile(id)]))));"
], cwd=ROOT, text=True))

with tempfile.TemporaryDirectory() as tmp:
    t = Path(tmp)
    ag = t / "android/graphics"
    org = t / "org/cachymusic/app"
    ag.mkdir(parents=True)
    org.mkdir(parents=True)
    (ag / "Color.java").write_text(STUBS)
    (ag / "Bitmap.java").write_text(BITMAP_STUB)
    (ag / "Canvas.java").write_text(CANVAS_STUB)
    (ag / "Paint.java").write_text(PAINT_STUB)
    (ag / "Path.java").write_text(PATH_STUB)
    (ag / "RectF.java").write_text(RECTF_STUB)
    (ag / "Shader.java").write_text(SHADER_STUB)
    (ag / "LinearGradient.java").write_text(GRAD_STUB)
    (org / "NotificationThemeArt.java").write_text(JAVA_SRC.read_text())
    (t / "ThemeArtTest.java").write_text(HARNESS)

    subprocess.run(["javac", "-d", str(t), *map(str, t.rglob("*.java"))], check=True)
    out = subprocess.check_output(["java", "-cp", str(t), "ThemeArtTest"], text=True).strip().splitlines()
    assert len(out) == 12
    for row in out:
        tid, style, light = row.split("|")
        assert js_profiles[tid]["style"] == style, (tid, js_profiles[tid]["style"], style)
        assert str(js_profiles[tid]["light"]).lower() == light, (tid, js_profiles[tid]["light"], light)

print("PASS NotificationThemeArt compiles cleanly, renders all 12 themes, and matches JS theme-catalog styles")
