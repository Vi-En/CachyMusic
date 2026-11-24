package org.cachymusic.app;

import java.util.List;

/** An activity-supplied window into the play queue or ordered library. */
final class NativePlaybackOrder {
    static final int MAX_TRACKS = 24;
    static final int MAX_JSON_LENGTH = 32_000;
    static final int MAX_CATALOG_TRACKS = 4096;
    static final int MAX_CATALOG_LENGTH = 2_000_000;
    static final int MAX_QUEUE_CATALOG_TRACKS = 512;

    enum CatalogKind {
        ORDERED, SHUFFLE, QUEUE
    }

    static final class Track {
        final String uri, title, artist, album, cover, queueId;

        Track(String uri, String title, String artist, String album, String cover, String queueId) {
            this.uri = uri;
            this.title = title;
            this.artist = artist;
            this.album = album;
            this.cover = cover;
            this.queueId = queueId;
        }
    }

    private final List<Track> tracks;
    private final boolean complete;
    final boolean repeatAll, repeatOne, queued;
    private int index;

    NativePlaybackOrder(List<Track> tracks, int index, boolean complete, boolean repeatAll, boolean repeatOne, boolean queued) {
        this.tracks = tracks;
        this.index = index;
        this.complete = complete;
        this.repeatAll = repeatAll;
        this.repeatOne = repeatOne;
        this.queued = queued;
    }

    boolean matches(String uri) {
        return index >= 0 && index < tracks.size() && tracks.get(index).uri.equals(uri);
    }

    Track move(int direction, boolean manual) {
        if (queued && direction < 0) return null;
        int target = index + direction;
        if (target < 0 || target >= tracks.size()) {
            if (queued || !complete || (!manual && !repeatAll)) return null;
            target = Math.floorMod(target, tracks.size());
        }
        index = target;
        return tracks.get(index);
    }
}
