<?php
// CachyMusic - Zero-Dependency Unified Storage Engine
// Provides seamless persistence using local JSON file storage with automatic MySQL sync when available.

class Storage {
    private static $dataFile = __DIR__ . '/../data/library.json';
    private static $memoryCache = null;
    private static $memoryCacheMtime = 0;
    private static $batchDepth = 0;
    private static $isDirty = false;
    private static $pathToTidIndex = null;

    public static function hasMySQL() {
        return isset($GLOBALS['connection']) && $GLOBALS['connection'] && !mysqli_connect_errno();
    }

    public static function beginBatch() {
        self::$batchDepth++;
    }

    public static function commitBatch() {
        if (self::$batchDepth > 0) {
            self::$batchDepth--;
        }
        if (self::$batchDepth === 0 && self::$isDirty && is_array(self::$memoryCache)) {
            self::$isDirty = false;
            self::write(self::$memoryCache, true);
        }
    }

    public static function init() {
        $dir = dirname(self::$dataFile);
        if (!is_dir($dir)) {
            @mkdir($dir, 0750, true);
        }
        $htaccess = $dir . '/.htaccess';
        if (!file_exists($htaccess)) {
            @file_put_contents($htaccess, "Order deny,allow\nDeny from all\n");
        }

        if (!file_exists(self::$dataFile)) {
            $defaultDir = '';

            $initData = [
                'default_directory' => $defaultDir,
                'playlists' => [],
                'tracks' => [],
                'soulseek' => [
                    'id' => 1,
                    'username' => '',
                    'password' => '',
                    'is_powered_on' => 0,
                    'downloads_dir' => $defaultDir,
                    'shared_dir' => $defaultDir
                ],
                'accounts' => []
            ];

            // If MySQL is online, seed initial data directly from MySQL
            if (self::hasMySQL()) {
                $conn = $GLOBALS['connection'];
                
                // 1. DefaultDirectory
                $res = @mysqli_query($conn, "SELECT default_directory FROM DefaultDirectory WHERE ddid = 1 LIMIT 1");
                if ($res && $row = mysqli_fetch_assoc($res)) {
                    if (!empty($row['default_directory'])) {
                        $initData['default_directory'] = $row['default_directory'];
                    }
                }

                // 2. SoulseekAccount
                $sRes = @mysqli_query($conn, "SELECT id, username, password, is_powered_on, downloads_dir, shared_dir FROM SoulseekAccount WHERE id = 1 LIMIT 1");
                if ($sRes && $sRow = mysqli_fetch_assoc($sRes)) {
                    $initData['soulseek'] = [
                        'id' => 1,
                        'username' => $sRow['username'] ?? '',
                        'password' => $sRow['password'] ?? '',
                        'is_powered_on' => (int)($sRow['is_powered_on'] ?? 0),
                        'downloads_dir' => $sRow['downloads_dir'] ?? $defaultDir,
                        'shared_dir' => $sRow['shared_dir'] ?? $defaultDir
                    ];
                }

                // 3. Playlists & Tracks
                $pRes = @mysqli_query($conn, "SELECT plid, playlist_name, username FROM Playlists ORDER BY plid ASC");
                if ($pRes) {
                    while ($pRow = mysqli_fetch_assoc($pRes)) {
                        $plid = (int)$pRow['plid'];
                        $trackIds = [];
                        $ptRes = @mysqli_query($conn, "SELECT tid FROM PlaylistTracks WHERE plid = $plid ORDER BY position ASC");
                        if ($ptRes) {
                            while ($ptRow = mysqli_fetch_assoc($ptRes)) {
                                $trackIds[] = (int)$ptRow['tid'];
                            }
                        }
                        $initData['playlists'][] = [
                            'plid' => $plid,
                            'name' => $pRow['playlist_name'],
                            'username' => $pRow['username'] ?: 'default',
                            'tracks' => $trackIds
                        ];
                    }
                }

                // 4. Tracks cache
                $tRes = @mysqli_query($conn, "SELECT tid, file_path, full_path, title, artist, album, genre, year, track_num, duration, bitrate, sample_rate, channels, bit_depth, format, file_size, mtime, has_cover, lyrics FROM Tracks");
                if ($tRes) {
                    while ($tRow = mysqli_fetch_assoc($tRes)) {
                        $tid = (int)$tRow['tid'];
                        $initData['tracks'][$tid] = [
                            'tid' => $tid,
                            'file_path' => $tRow['file_path'],
                            'full_path' => $tRow['full_path'] ?: $tRow['file_path'],
                            'title' => $tRow['title'],
                            'artist' => $tRow['artist'],
                            'album' => $tRow['album'],
                            'genre' => $tRow['genre'],
                            'year' => $tRow['year'],
                            'track_num' => $tRow['track_num'],
                            'duration' => (float)$tRow['duration'],
                            'bitrate' => $tRow['bitrate'],
                            'sample_rate' => $tRow['sample_rate'],
                            'channels' => $tRow['channels'],
                            'bit_depth' => $tRow['bit_depth'],
                            'format' => $tRow['format'],
                            'file_size' => (int)$tRow['file_size'],
                            'mtime' => (int)$tRow['mtime'],
                            'has_cover' => (int)$tRow['has_cover'],
                            'lyrics' => $tRow['lyrics']
                        ];
                    }
                }
            }

            @file_put_contents(self::$dataFile, json_encode($initData, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
        }
    }

    public static function read() {
        self::init();
        if (self::$memoryCache !== null) {
            if (self::$batchDepth > 0 || self::$isDirty) {
                return self::$memoryCache;
            }
            clearstatcache(true, self::$dataFile);
            $mtime = @filemtime(self::$dataFile) ?: 0;
            if ($mtime > 0 && $mtime === self::$memoryCacheMtime) {
                return self::$memoryCache;
            }
        }
        $fp = @fopen(self::$dataFile, 'c+');
        if (!$fp) return is_array(self::$memoryCache) ? self::$memoryCache : [];
        @flock($fp, LOCK_SH);
        $contents = @stream_get_contents($fp);
        @flock($fp, LOCK_UN);
        @fclose($fp);
        
        $data = json_decode($contents, true);
        if (is_array($data)) {
            self::$memoryCache = $data;
            self::$memoryCacheMtime = @filemtime(self::$dataFile) ?: time();
            self::$pathToTidIndex = null;
        } else if (self::$memoryCache === null) {
            // If file was genuinely empty (0 bytes), initialize empty schema
            if (empty(trim($contents))) {
                self::$memoryCache = [];
            } else {
                // Parse error on non-empty file: log warning and do not return empty array
                error_log('[Storage] Warning: library.json parse failed; preserving in-memory state.');
                self::$memoryCache = [];
            }
        }
        return self::$memoryCache;
    }

    public static function write($data, $forceFlush = false) {
        self::init();
        self::$memoryCache = $data;
        if (self::$batchDepth > 0 && !$forceFlush) {
            self::$isDirty = true;
            return true;
        }
        $dir = dirname(self::$dataFile);
        $tempFile = @tempnam($dir, 'lib_tmp_');
        if ($tempFile === false) {
            $tempFile = self::$dataFile . '.' . uniqid('tmp_', true);
        }
        // Use JSON_INVALID_UTF8_SUBSTITUTE to prevent json_encode returning false on non-UTF8 tag bytes
        $jsonFlags = JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES;
        if (defined('JSON_INVALID_UTF8_SUBSTITUTE')) {
            $jsonFlags |= JSON_INVALID_UTF8_SUBSTITUTE;
        }
        $json = json_encode($data, $jsonFlags);
        if ($json === false) {
            error_log('[Storage] Error: json_encode failed: ' . json_last_error_msg());
            @unlink($tempFile);
            return false;
        }
        if (@file_put_contents($tempFile, $json, LOCK_EX) === false) {
            @unlink($tempFile);
            return false;
        }
        @chmod($tempFile, 0640);
        if (!@rename($tempFile, self::$dataFile)) {
            // Fallback for filesystem boundary or Windows lock
            @copy($tempFile, self::$dataFile);
            @unlink($tempFile);
        }
        clearstatcache(true, self::$dataFile);
        self::$memoryCacheMtime = @filemtime(self::$dataFile) ?: time();
        self::$isDirty = false;
        return true;
    }

    // --- DEFAULT DIRECTORY ---
    public static function getDefaultDirectory() {
        $placeholderAudio = realpath(__DIR__ . '/../resources/audio');
        $isPlaceholder = function($path) use ($placeholderAudio) {
            $trimmed = trim((string)$path);
            if ($trimmed === '') return true;
            if ($placeholderAudio && $trimmed === $placeholderAudio) return true;
            if (str_ends_with(str_replace('\\', '/', $trimmed), '/resources/audio')) return true;
            return false;
        };

        $data = self::read();
        if (is_array($data) && array_key_exists('default_directory', $data)) {
            $saved = trim((string)$data['default_directory']);
            if (!$isPlaceholder($saved)) {
                return $saved;
            }
            return '';
        }

        if (self::hasMySQL()) {
            $conn = $GLOBALS['connection'];
            $res = @mysqli_query($conn, "SELECT default_directory FROM DefaultDirectory WHERE ddid = 1 LIMIT 1");
            if ($res && $row = mysqli_fetch_assoc($res)) {
                $dbDir = trim((string)($row['default_directory'] ?? ''));
                if (!$isPlaceholder($dbDir)) {
                    return $dbDir;
                }
            }
        }

        return '';
    }

    public static function setDefaultDirectory($dir) {
        $dir = trim($dir);
        if (self::hasMySQL()) {
            $conn = $GLOBALS['connection'];
            $stmt = $conn->prepare("INSERT INTO DefaultDirectory (ddid, default_directory) VALUES (1, ?) ON DUPLICATE KEY UPDATE default_directory = VALUES(default_directory)");
            if ($stmt) {
                $stmt->bind_param("s", $dir);
                $stmt->execute();
            }
        }

        $data = self::read();
        if (($data['default_directory'] ?? '') === $dir) {
            return true;
        }
        $data['default_directory'] = $dir;
        self::write($data);
        return true;
    }

    // --- PLAYLISTS ---
    public static function getPlaylists($username = 'default') {
        if (self::hasMySQL()) {
            $conn = $GLOBALS['connection'];
            $query = "
                SELECT p.plid, p.playlist_name, p.username, COUNT(pt.ptid) as track_count
                FROM Playlists p
                LEFT JOIN PlaylistTracks pt ON p.plid = pt.plid
                WHERE p.username = ? OR p.username = 'default'
                GROUP BY p.plid, p.playlist_name, p.username
                ORDER BY p.plid ASC
            ";
            $stmt = $conn->prepare($query);
            if ($stmt) {
                $stmt->bind_param("s", $username);
                $stmt->execute();
                $res = $stmt->get_result();
                $playlists = [];
                while ($row = mysqli_fetch_assoc($res)) {
                    $playlists[] = [
                        'plid'        => (int)$row['plid'],
                        'name'        => $row['playlist_name'],
                        'username'    => $row['username'],
                        'track_count' => (int)$row['track_count']
                    ];
                }
                return $playlists;
            }
        }

        $data = self::read();
        $playlists = [];
        foreach ($data['playlists'] ?? [] as $pl) {
            if ($pl['username'] === $username || $pl['username'] === 'default') {
                $playlists[] = [
                    'plid'        => (int)$pl['plid'],
                    'name'        => $pl['name'],
                    'username'    => $pl['username'],
                    'track_count' => count($pl['tracks'] ?? [])
                ];
            }
        }
        return $playlists;
    }

    public static function getPlaylist($plid) {
        $plid = (int)$plid;
        if (self::hasMySQL()) {
            $conn = $GLOBALS['connection'];
            $pStmt = $conn->prepare("SELECT plid, playlist_name, username FROM Playlists WHERE plid = ? LIMIT 1");
            if ($pStmt) {
                $pStmt->bind_param("i", $plid);
                $pStmt->execute();
                $pRes = $pStmt->get_result();
                $playlist = $pRes->fetch_assoc();
                if ($playlist) {
                    $tStmt = $conn->prepare("
                        SELECT 
                            pt.ptid, 
                            pt.tid, 
                            pt.position, 
                            t.file_path,
                            t.full_path,
                            t.title,
                            t.artist,
                            t.album,
                            t.genre,
                            t.year,
                            t.track_num AS track,
                            t.duration,
                            t.bitrate,
                            t.sample_rate AS sampleRate,
                            t.channels,
                            t.format,
                            t.file_size AS size,
                            t.has_cover AS hasCover,
                            t.lyrics
                        FROM PlaylistTracks pt
                        JOIN Tracks t ON pt.tid = t.tid
                        WHERE pt.plid = ?
                        ORDER BY pt.position ASC
                    ");
                    $tracks = [];
                    if ($tStmt) {
                        $tStmt->bind_param("i", $plid);
                        $tStmt->execute();
                        $tRes = $tStmt->get_result();
                        while ($row = mysqli_fetch_assoc($tRes)) {
                            $row['hasCover'] = (bool)$row['hasCover'];
                            $row['cover'] = $row['hasCover'] ? ('php/api/cover.php?tid=' . $row['tid']) : null;
                            $row['src'] = 'php/api/stream.php?tid=' . $row['tid'];
                            $tracks[] = $row;
                        }
                    }
                    $playlist['tracks'] = $tracks;
                    return $playlist;
                }
            }
        }

        $data = self::read();
        foreach ($data['playlists'] ?? [] as $pl) {
            if ((int)$pl['plid'] === $plid) {
                $tracks = [];
                $pos = 1;
                foreach ($pl['tracks'] ?? [] as $tid) {
                    $t = $data['tracks'][(string)$tid] ?? $data['tracks'][(int)$tid] ?? null;
                    if ($t) {
                        $fullPath = $t['full_path'] ?: $t['file_path'];
                        $tracks[] = [
                            'ptid' => $pos,
                            'tid' => (int)$t['tid'],
                            'position' => $pos,
                            'file_path' => $t['file_path'],
                            'full_path' => $fullPath,
                            'title' => $t['title'],
                            'artist' => $t['artist'],
                            'album' => $t['album'],
                            'genre' => $t['genre'],
                            'year' => $t['year'],
                            'track' => $t['track_num'] ?? $t['track'] ?? '1',
                            'duration' => $t['duration'],
                            'bitrate' => $t['bitrate'],
                            'sampleRate' => $t['sample_rate'] ?? $t['sampleRate'] ?? 44100,
                            'channels' => $t['channels'] ?? 2,
                            'format' => $t['format'],
                            'size' => $t['file_size'] ?? $t['size'],
                            'hasCover' => (bool)($t['has_cover'] ?? $t['hasCover']),
                            'cover' => (!empty($t['has_cover']) || !empty($t['hasCover'])) ? ('php/api/cover.php?tid=' . $t['tid']) : null,
                            'lyrics' => $t['lyrics'] ?? null,
                            'src' => 'php/api/stream.php?path=' . urlencode($fullPath)
                        ];
                        $pos++;
                    }
                }
                return [
                    'plid' => (int)$pl['plid'],
                    'name' => $pl['name'],
                    'username' => $pl['username'],
                    'tracks' => $tracks
                ];
            }
        }
        return null;
    }

    public static function createPlaylist($name, $username = 'default') {
        $name = trim($name);
        if (empty($name)) return false;

        $newPlid = null;
        if (self::hasMySQL()) {
            $conn = $GLOBALS['connection'];
            $stmt = $conn->prepare("INSERT INTO Playlists (playlist_name, username) VALUES (?, ?) ON DUPLICATE KEY UPDATE playlist_name = VALUES(playlist_name)");
            if ($stmt) {
                $stmt->bind_param("ss", $name, $username);
                if ($stmt->execute()) {
                    $newPlid = $conn->insert_id ?: $stmt->insert_id;
                }
            }
        }

        $data = self::read();
        if (!$newPlid) {
            $maxId = 0;
            foreach ($data['playlists'] ?? [] as $pl) {
                if ((int)$pl['plid'] > $maxId) $maxId = (int)$pl['plid'];
            }
            $newPlid = $maxId + 1;
        }

        // Check if playlist with name already exists
        $found = false;
        foreach ($data['playlists'] as &$pl) {
            if ($pl['name'] === $name && ($pl['username'] === $username || $pl['username'] === 'default')) {
                $found = true;
                $newPlid = (int)$pl['plid'];
                break;
            }
        }
        if (!$found) {
            $data['playlists'][] = [
                'plid' => (int)$newPlid,
                'name' => $name,
                'username' => $username,
                'tracks' => []
            ];
            self::write($data);
        }
        return $newPlid;
    }

    public static function deletePlaylist($plid, $username = 'default') {
        $plid = (int)$plid;
        $deleted = false;

        if (self::hasMySQL()) {
            $conn = $GLOBALS['connection'];
            $stmt = $conn->prepare("DELETE FROM Playlists WHERE plid = ? AND (username = ? OR username = 'default')");
            if ($stmt) {
                $stmt->bind_param("is", $plid, $username);
                if ($stmt->execute() && $stmt->affected_rows > 0) {
                    $deleted = true;
                }
            }
        }

        $data = self::read();
        $initialCount = count($data['playlists'] ?? []);
        $data['playlists'] = array_values(array_filter($data['playlists'] ?? [], function($pl) use ($plid, $username) {
            if ((int)$pl['plid'] === $plid && ($pl['username'] === $username || $pl['username'] === 'default')) {
                return false;
            }
            return true;
        }));
        if (count($data['playlists']) < $initialCount) {
            $deleted = true;
            self::write($data);
        }
        return $deleted;
    }

    public static function addTrackToPlaylist($plid, $tid) {
        $plid = (int)$plid;
        $tid = (int)$tid;
        if (!$plid || !$tid) return false;

        if (self::hasMySQL()) {
            $conn = $GLOBALS['connection'];
            $checkStmt = $conn->prepare("SELECT ptid FROM PlaylistTracks WHERE plid = ? AND tid = ?");
            if ($checkStmt) {
                $checkStmt->bind_param("ii", $plid, $tid);
                $checkStmt->execute();
                if ($checkStmt->get_result()->num_rows > 0) {
                    return 'already_in_playlist';
                }
            }
            $posStmt = $conn->prepare("SELECT COALESCE(MAX(position), 0) + 1 AS next_pos FROM PlaylistTracks WHERE plid = ?");
            if ($posStmt) {
                $posStmt->bind_param("i", $plid);
                $posStmt->execute();
                $nextPos = (int)$posStmt->get_result()->fetch_assoc()['next_pos'];
                $insStmt = $conn->prepare("INSERT INTO PlaylistTracks (plid, tid, position) VALUES (?, ?, ?)");
                if ($insStmt) {
                    $insStmt->bind_param("iii", $plid, $tid, $nextPos);
                    $insStmt->execute();
                }
            }
        }

        $data = self::read();
        foreach ($data['playlists'] as &$pl) {
            if ((int)$pl['plid'] === $plid) {
                if (!isset($pl['tracks'])) $pl['tracks'] = [];
                if (in_array($tid, $pl['tracks'], true)) {
                    return 'already_in_playlist';
                }
                $pl['tracks'][] = $tid;
                self::write($data);
                return true;
            }
        }
        return false;
    }

    public static function removeTrackFromPlaylist($plid, $tid) {
        $plid = (int)$plid;
        $tid = (int)$tid;
        if (!$plid || !$tid) return false;

        if (self::hasMySQL()) {
            $conn = $GLOBALS['connection'];
            $stmt = $conn->prepare("DELETE FROM PlaylistTracks WHERE plid = ? AND tid = ?");
            if ($stmt) {
                $stmt->bind_param("ii", $plid, $tid);
                $stmt->execute();
            }
        }

        $data = self::read();
        foreach ($data['playlists'] as &$pl) {
            if ((int)$pl['plid'] === $plid && isset($pl['tracks'])) {
                $pl['tracks'] = array_values(array_filter($pl['tracks'], function($t) use ($tid) {
                    return (int)$t !== $tid;
                }));
                self::write($data);
                return true;
            }
        }
        return false;
    }

    // --- TRACKS CACHE ---
    public static function getCachedTracks($searchPrefix = '') {
        $cached = [];
        if (self::hasMySQL()) {
            $conn = $GLOBALS['connection'];
            $prefix = $searchPrefix . '%';
            $stmt = $conn->prepare("SELECT tid, file_path, full_path, title, artist, album, genre, year, track_num, duration, bitrate, sample_rate, channels, bit_depth, format, file_size, mtime, has_cover, lyrics FROM Tracks WHERE full_path LIKE ? OR file_path LIKE ?");
            if ($stmt) {
                $stmt->bind_param("ss", $prefix, $prefix);
                $stmt->execute();
                $res = $stmt->get_result();
                while ($row = $res->fetch_assoc()) {
                    $key = $row['full_path'] ?: $row['file_path'];
                    $cached[$key] = $row;
                }
                if (!empty($cached)) return $cached;
            }
        }

        $data = self::read();
        foreach ($data['tracks'] ?? [] as $t) {
            $fullPath = $t['full_path'] ?: $t['file_path'];
            if (empty($searchPrefix) || str_starts_with($fullPath, $searchPrefix)) {
                $cached[$fullPath] = $t;
            }
        }
        return $cached;
    }

    public static function upsertTrack($trackData) {
        $tid = null;
        if (self::hasMySQL()) {
            $conn = $GLOBALS['connection'];
            $stmt = $conn->prepare("
                INSERT INTO Tracks (file_path, full_path, title, artist, album, genre, year, track_num, duration, bitrate, sample_rate, channels, bit_depth, format, file_size, mtime, has_cover, lyrics)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    full_path = VALUES(full_path),
                    title = VALUES(title),
                    artist = VALUES(artist),
                    album = VALUES(album),
                    genre = VALUES(genre),
                    year = VALUES(year),
                    track_num = VALUES(track_num),
                    duration = VALUES(duration),
                    bitrate = VALUES(bitrate),
                    sample_rate = VALUES(sample_rate),
                    channels = VALUES(channels),
                    bit_depth = VALUES(bit_depth),
                    format = VALUES(format),
                    file_size = VALUES(file_size),
                    mtime = VALUES(mtime),
                    has_cover = VALUES(has_cover),
                    lyrics = VALUES(lyrics)
            ");
            if ($stmt) {
                $hasCoverInt = !empty($trackData['has_cover']) ? 1 : 0;
                $stmt->bind_param(
                    "sssssiisidiiisiiis",
                    $trackData['file_path'],
                    $trackData['full_path'],
                    $trackData['title'],
                    $trackData['artist'],
                    $trackData['album'],
                    $trackData['genre'],
                    $trackData['year'],
                    $trackData['track_num'],
                    $trackData['duration'],
                    $trackData['bitrate'],
                    $trackData['sample_rate'],
                    $trackData['channels'],
                    $trackData['bit_depth'],
                    $trackData['format'],
                    $trackData['file_size'],
                    $trackData['mtime'],
                    $hasCoverInt,
                    $trackData['lyrics']
                );
                if ($stmt->execute()) {
                    $tid = $conn->insert_id ?: $stmt->insert_id;
                }
            }
        }

        $data = self::read();
        $fullPath = $trackData['full_path'] ?: $trackData['file_path'];

        if (self::$pathToTidIndex === null) {
            self::$pathToTidIndex = ['byPath' => [], 'maxTid' => 0];
            foreach ($data['tracks'] ?? [] as $existingTid => $t) {
                $numTid = (int)$existingTid;
                if ($numTid > self::$pathToTidIndex['maxTid']) {
                    self::$pathToTidIndex['maxTid'] = $numTid;
                }
                if (!empty($t['full_path'])) {
                    self::$pathToTidIndex['byPath'][$t['full_path']] = $numTid;
                }
                if (!empty($t['file_path'])) {
                    self::$pathToTidIndex['byPath'][$t['file_path']] = $numTid;
                }
            }
        }

        if (!$tid) {
            if (isset(self::$pathToTidIndex['byPath'][$fullPath])) {
                $tid = self::$pathToTidIndex['byPath'][$fullPath];
            } elseif (!empty($trackData['file_path']) && isset(self::$pathToTidIndex['byPath'][$trackData['file_path']])) {
                $tid = self::$pathToTidIndex['byPath'][$trackData['file_path']];
            } else {
                self::$pathToTidIndex['maxTid']++;
                $tid = self::$pathToTidIndex['maxTid'];
            }
        } elseif ((int)$tid > self::$pathToTidIndex['maxTid']) {
            self::$pathToTidIndex['maxTid'] = (int)$tid;
        }

        $tid = (int)$tid;
        if (!empty($fullPath)) self::$pathToTidIndex['byPath'][$fullPath] = $tid;
        if (!empty($trackData['file_path'])) self::$pathToTidIndex['byPath'][$trackData['file_path']] = $tid;

        $existing = $data['tracks'][(string)$tid] ?? null;
        if ($existing !== null && ($existing['mtime'] ?? 0) === ($trackData['mtime'] ?? 0) && ($existing['file_size'] ?? 0) === ($trackData['file_size'] ?? 0) && !empty($existing['title'])) {
            return $tid;
        }

        $trackData['tid'] = $tid;
        $data['tracks'][(string)$tid] = $trackData;
        self::write($data);
        return $tid;
    }

    public static function getTrackPath($tid) {
        $tid = (int)$tid;
        if (self::hasMySQL()) {
            $conn = $GLOBALS['connection'];
            $stmt = $conn->prepare("SELECT full_path, file_path FROM Tracks WHERE tid = ? LIMIT 1");
            if ($stmt) {
                $stmt->bind_param("i", $tid);
                $stmt->execute();
                $res = $stmt->get_result();
                if ($res && $row = $res->fetch_assoc()) {
                    return $row['full_path'] ?: $row['file_path'];
                }
            }
        }

        $data = self::read();
        $t = $data['tracks'][(string)$tid] ?? $data['tracks'][$tid] ?? null;
        if ($t) {
            return $t['full_path'] ?: $t['file_path'];
        }
        return null;
    }

    public static function updateTrackMetadata($tid, $fields) {
        $tid = (int)$tid;
        if ($tid <= 0) return false;

        $data = self::read();
        $strTid = (string)$tid;
        $track = $data['tracks'][$strTid] ?? null;

        if ($track === null) {
            foreach ($data['tracks'] ?? [] as $k => $t) {
                if ((int)($t['tid'] ?? 0) === $tid || (int)$k === $tid) {
                    $strTid = (string)$k;
                    $track = $t;
                    break;
                }
            }
        }

        if ($track === null) return false;

        $updatable = ['title', 'artist', 'album', 'genre', 'year', 'track_num', 'lyrics', 'has_cover'];
        $hasChanges = false;
        foreach ($updatable as $key) {
            if (array_key_exists($key, $fields)) {
                $val = trim((string)$fields[$key]);
                if ($key === 'year' || $key === 'track_num') {
                    $val = is_numeric($val) ? (int)$val : null;
                } elseif ($key === 'has_cover') {
                    $val = !empty($fields[$key]) ? 1 : 0;
                }
                $track[$key] = $val;
                $hasChanges = true;
            }
        }

        if ($hasChanges) {
            $data['tracks'][$strTid] = $track;
            self::write($data);

            if (self::hasMySQL()) {
                $conn = $GLOBALS['connection'];
                $hasCov = !empty($track['has_cover']) ? 1 : 0;
                $stmt = $conn->prepare("UPDATE Tracks SET title = ?, artist = ?, album = ?, genre = ?, year = ?, track_num = ?, has_cover = ? WHERE tid = ?");
                if ($stmt) {
                    $yr = $track['year'] ?? null;
                    $trk = $track['track_num'] ?? null;
                    $stmt->bind_param("ssssiiii", $track['title'], $track['artist'], $track['album'], $track['genre'], $yr, $trk, $hasCov, $tid);
                    $stmt->execute();
                }
            }
        }

        return $track;
    }

    // --- SOULSEEK ACCOUNT ---
    public static function getSoulseekAccount() {
        if (self::hasMySQL()) {
            $conn = $GLOBALS['connection'];
            $res = @mysqli_query($conn, "SELECT id, username, password, is_powered_on, downloads_dir, shared_dir FROM SoulseekAccount WHERE id = 1 LIMIT 1");
            if ($res && $row = mysqli_fetch_assoc($res)) {
                return $row;
            }
        }

        $data = self::read();
        return $data['soulseek'] ?? [
            'id' => 1,
            'username' => '',
            'password' => '',
            'is_powered_on' => 0,
            'downloads_dir' => '',
            'shared_dir' => ''
        ];
    }

    public static function saveSoulseekAccount($cfg) {
        if (self::hasMySQL()) {
            $conn = $GLOBALS['connection'];
            $stmt = $conn->prepare("REPLACE INTO SoulseekAccount (id, username, password, is_powered_on, downloads_dir, shared_dir) VALUES (1, ?, ?, ?, ?, ?)");
            if ($stmt) {
                $pOn = (int)($cfg['is_powered_on'] ?? 0);
                $stmt->bind_param("ssiss", $cfg['username'], $cfg['password'], $pOn, $cfg['downloads_dir'], $cfg['shared_dir']);
                $stmt->execute();
            }
        }

        $data = self::read();
        $data['soulseek'] = [
            'id' => 1,
            'username' => $cfg['username'] ?? '',
            'password' => $cfg['password'] ?? '',
            'is_powered_on' => (int)($cfg['is_powered_on'] ?? 0),
            'downloads_dir' => $cfg['downloads_dir'] ?? '',
            'shared_dir' => $cfg['shared_dir'] ?? ''
        ];
        self::write($data);
        return true;
    }

    // --- USER ACCOUNTS ---
    public static function getAccountByUsername($username) {
        if (self::hasMySQL()) {
            $conn = $GLOBALS['connection'];
            $stmt = $conn->prepare("SELECT id, username, password FROM Accounts WHERE username = ? LIMIT 1");
            if ($stmt) {
                $stmt->bind_param('s', $username);
                $stmt->execute();
                $res = $stmt->get_result();
                if ($res && $row = $res->fetch_assoc()) {
                    return $row;
                }
            }
            return null;
        }

        $data = self::read();
        $accounts = $data['accounts'] ?? [];
        foreach ($accounts as $acc) {
            if (isset($acc['username']) && strtolower($acc['username']) === strtolower($username)) {
                return $acc;
            }
        }
        return null;
    }

    public static function createAccount($username, $passwordHash) {
        if (self::hasMySQL()) {
            $conn = $GLOBALS['connection'];
            $stmt = $conn->prepare("INSERT INTO Accounts (username, password) VALUES (?, ?)");
            if ($stmt) {
                $stmt->bind_param('ss', $username, $passwordHash);
                if ($stmt->execute()) {
                    return (int)$conn->insert_id;
                }
            }
            return false;
        }

        $data = self::read();
        if (!isset($data['accounts']) || !is_array($data['accounts'])) {
            $data['accounts'] = [];
        }

        foreach ($data['accounts'] as $acc) {
            if (isset($acc['username']) && strtolower($acc['username']) === strtolower($username)) {
                return false; // Already exists
            }
        }

        $maxId = 0;
        foreach ($data['accounts'] as $acc) {
            if (isset($acc['id']) && (int)$acc['id'] > $maxId) {
                $maxId = (int)$acc['id'];
            }
        }
        $newId = $maxId + 1;
        $data['accounts'][] = [
            'id' => $newId,
            'username' => $username,
            'password' => $passwordHash,
            'created_at' => date('Y-m-d H:i:s')
        ];
        self::write($data);
        return $newId;
    }
}
