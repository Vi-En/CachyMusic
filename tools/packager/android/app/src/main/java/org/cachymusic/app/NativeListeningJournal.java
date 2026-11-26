package org.cachymusic.app;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONArray;
import org.json.JSONObject;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.Map;
import java.util.ArrayList;
import java.util.Collections;

/** Bounded, private outbox. Receipt removal is allowed only after a web storage commit.
 * All operations serialize across the Activity bridge and service looper. */
final class NativeListeningJournal {
    private static final String PREFS = "cachymusic_native_listening";
    private static final int LIMIT = 1024, BATCH = 32;
    private static String warning = "";
    private static boolean configurationUnconfirmed;
    private static String lastOffered = "";
    static synchronized String warning() { return warning; }
    private static SharedPreferences prefs(Context c) { return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }
    static synchronized boolean configure(Context c, boolean enabled, String generation, boolean erase) {
        if (generation == null || !generation.matches("[0-9]{1,15}")) return false;
        SharedPreferences p = prefs(c);
        long old = Long.parseLong(p.getString("generation", "0")), next = Long.parseLong(generation);
        if (next < old) {
            // A stale WebView may always request a privacy stop, never a stale
            // enable or erase. Preserve the native generation and receipts.
            if (enabled || erase) return false;
            boolean stopped = p.edit().putBoolean("enabled", false).commit();
            configurationUnconfirmed = !stopped;
            if (!stopped) warning = "Native history privacy stop could not be saved.";
            return stopped;
        }
        SharedPreferences.Editor edit = p.edit();
        if (erase || next > old) edit.clear();
        boolean committed = edit.putString("generation", generation).putBoolean("enabled", enabled && !erase).commit();
        configurationUnconfirmed = !committed;
        if (!committed) warning = "Native history configuration could not be saved.";
        else if (erase || next > old) warning = "";
        return committed;
    }
    static synchronized String generation(Context c) {
        SharedPreferences p = prefs(c);
        return !configurationUnconfirmed && p.getBoolean("enabled", false) ? p.getString("generation", "0") : null;
    }
    static synchronized boolean append(Context c, String expected, String id, String uri, String title, String artist, String album, long duration) {
        return append(c,expected,id,uri,title,artist,album,duration,"");
    }
    static synchronized boolean append(Context c, String expected, String id, String uri, String title, String artist, String album, long duration, String historyKey) {
        SharedPreferences p = prefs(c);
        if (expected == null || !expected.equals(generation(c))) return false;
        if (id == null || !id.matches("native-[a-zA-Z0-9-]{1,64}")) return false;
        String slot = "visit:" + id;
        if (p.contains(slot)) return p.edit().putString(slot, p.getString(slot, "")).commit();
        if (p.getAll().size() >= LIMIT + 2) { warning = "Native history queue is full; some visits may not be recorded."; return false; }
        try {
            // Native events deliberately retain a separate, unverified source identity.
            // Do not guess that a later catalog entry is the same recording.
            String key = historyKey != null && historyKey.startsWith("recording:") && historyKey.length()<=12000 ? historyKey : "native-source:" + new JSONArray().put(uri).put(title).put(artist).put(album).put(duration).toString();
            if (key.length() > 20000) { warning = "A native recording identity exceeds the history limit."; return false; }
            JSONObject e = new JSONObject().put("id", id).put("generation", expected)
                .put("day", new SimpleDateFormat("yyyy-MM-dd", Locale.ROOT).format(new Date()))
                .put("key", key).put("title", bounded(title)).put("artist", bounded(artist));
            boolean committed = p.edit().putString(slot, e.toString()).commit();
            if (!committed) warning = "A native listening visit could not be saved.";
            return committed;
        } catch (Exception ex) { warning = "A native listening visit could not be saved."; return false; }
    }
    private static String bounded(String value) { return value == null ? "" : value.substring(0, Math.min(512, value.length())); }
    static synchronized String pending(Context c) {
        JSONArray result = new JSONArray();
        try {
            Map<String, ?> entries = prefs(c).getAll();
            ArrayList<String> slots = new ArrayList<>();
            for (String slot : entries.keySet()) if (slot.startsWith("visit:")) slots.add(slot);
            Collections.sort(slots);
            if (slots.isEmpty()) { lastOffered = ""; return result.toString(); }
            // Resume strictly after the last offered key, even if it was removed.
            // Unacknowledged receipts remain in storage but cannot monopolize a batch.
            int start = Collections.binarySearch(slots, lastOffered);
            start = start >= 0 ? start + 1 : -start - 1;
            for (int i = 0; i < slots.size() && result.length() < BATCH; i++) {
                String slot = slots.get((start + i) % slots.size());
                lastOffered = slot;
                Object value = entries.get(slot);
                try {
                    if (!(value instanceof String)) throw new IllegalArgumentException("Invalid receipt type");
                    result.put(new JSONObject((String)value));
                } catch (Exception malformed) {
                    warning = "A malformed native receipt was retained; clear history if recovery is not needed.";
                }
            }
        } catch (Exception ex) { warning = "Native history could not be read."; }
        return result.toString();
    }
    static synchronized boolean acknowledge(Context c, String id, String expected) {
        if (id == null || !id.matches("native-[a-zA-Z0-9-]{1,64}")) return false;
        SharedPreferences p = prefs(c);
        if (!p.getString("generation", "0").equals(expected)) return false;
        return p.edit().remove("visit:" + id).commit();
    }
}
