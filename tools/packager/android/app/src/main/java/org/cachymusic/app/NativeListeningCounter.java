package org.cachymusic.app;

/** Service-looper listening qualification. No UI clock or inferred sleep intervals. */
final class NativeListeningCounter {
    private long lastTime = -1, lastPosition, elapsed;
    private boolean counted;
    void begin() { elapsed = 0; counted = false; interrupt(); }
    void interrupt() { lastTime = -1; }
    boolean sample(long now, long position, long duration, boolean playing) {
        if (!playing || duration <= 0 || position < 0) { interrupt(); return false; }
        if (lastTime >= 0 && !counted) {
            long dt = now - lastTime, delta = position - lastPosition;
            if (dt > 0 && dt <= 3000 && delta > 0 && delta <= dt + 120) elapsed += Math.min(delta, dt);
        }
        lastTime = now; lastPosition = position;
        return !counted && elapsed >= Math.min(30000, duration / 2);
    }
    void committed() { counted = true; }
}
