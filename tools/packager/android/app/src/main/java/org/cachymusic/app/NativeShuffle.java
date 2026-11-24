package org.cachymusic.app;

import org.cachymusic.app.NativePlaybackOrder.Track;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Random;
import java.util.Set;

/** The shuffle pass and playback history belong to the service's current session. */
final class NativeShuffle {
    private final Random random;
    private final List<Track> history = new ArrayList<>();
    private final Set<String> played = new LinkedHashSet<>();
    private final Set<String> poolUris = new HashSet<>();
    private List<Track> pool = Collections.emptyList();
    private boolean complete;
    private int cursor = -1;

    NativeShuffle(Random random) {
        this.random = random;
    }

    boolean active() {
        return cursor >= 0;
    }

    void clear() {
        history.clear();
        played.clear();
        poolUris.clear();
        pool = Collections.emptyList();
        cursor = -1;
    }

    void update(List<Track> pool, boolean complete, Track current) {
        this.complete = complete;
        if (this.pool != pool) {
            this.pool = pool;
            poolUris.clear();
            for (Track track : pool) poolUris.add(track.uri);
        }
        if (!active() || !history.get(cursor).uri.equals(current.uri)) record(current);
    }

    private void record(Track track) {
        history.subList(cursor + 1, history.size()).clear();
        // A history replay never consumes the original queue entry again.
        history.add(new Track(track.uri, track.title, track.artist, track.album, track.cover, ""));
        if (history.size() > NativePlaybackOrder.MAX_TRACKS) history.remove(0);
        cursor = history.size() - 1;
        played.add(track.uri);
        // A refreshed pool can change during the session. Bound identities from past pools.
        if (played.size() > NativePlaybackOrder.MAX_CATALOG_TRACKS + 2 * NativePlaybackOrder.MAX_TRACKS) {
            for (var entry = played.iterator(); entry.hasNext(); ) {
                if (poolUris.contains(entry.next())) continue;
                entry.remove();
                break;
            }
        }
    }

    Track previous() {
        return cursor > 0 ? history.get(--cursor) : null;
    }

    boolean exhausted() {
        return complete && cursor + 1 == history.size()
                && pool.stream().allMatch(track -> played.contains(track.uri));
    }

    Track next(NativePlaybackOrder order, boolean queueComplete, boolean manual) {
        if (order.queued) {
            Track queued = order.move(1, manual);
            if (queued != null) {
                record(queued);
                return queued;
            }
            if (!queueComplete) return null;
        }
        if (cursor + 1 < history.size()) return history.get(++cursor);

        List<Track> choices = new ArrayList<>();
        for (Track track : pool) {
            if (!played.contains(track.uri)) choices.add(track);
        }
        if (choices.isEmpty() && complete && (manual || order.repeatAll)) {
            choices.addAll(pool);
            String current = history.get(cursor).uri;
            if (choices.size() > 1) choices.removeIf(track -> track.uri.equals(current));
            played.clear();
        }
        if (choices.isEmpty()) return null;
        Track track = choices.get(random.nextInt(choices.size()));
        record(track);
        return track;
    }
}
