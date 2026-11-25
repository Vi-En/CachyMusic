<?php
// CachyMusic - Zero-Dependency Unified Storage Engine (v2.0.0)
// Cross-platform persistence in cachy_data_dir() via SQLite3 WAL (when loaded) + POSIX atomic JSON, with MySQL sync when available.

require_once(__DIR__ . '/platform.php');
require_once(__DIR__ . '/playlist-sql.php');

class Storage {
    private static $dataFile = null;
    private static $sqliteFile = null;
    private static $sqlite = null;
    private static $memoryCache = null;
    private static $memoryCacheMtime = 0;
    private static $batchDepth = 0;
    private static $isDirty = false;
    private static $pathToTidIndex = null;
    private static $readBase = null;
    private static $writeLock = null;

    // Lock a stable sidecar inode, not the JSON inode replaced by rename.
    private static function locked(callable $fn) {
        if (self::$writeLock !== null) return $fn();
        self::resolvePaths();
        $lock = @fopen(self::$dataFile . '.lock', 'c');
        if (!$lock) return false;
        $deadline = microtime(true) + 3;
        while (!@flock($lock, LOCK_EX | LOCK_NB)) {
            if (microtime(true) >= $deadline) { fclose($lock); return false; }
            usleep(20000);
        }
        self::$writeLock = $lock;
        try { return $fn(); }
        finally { self::$writeLock = null; flock($lock, LOCK_UN); fclose($lock); }
    }

    private static function freshData() {
        clearstatcache(true, self::$dataFile);
        $raw = @file_get_contents(self::$dataFile);
        $data = $raw === false ? null : json_decode($raw, true);
        return is_array($data) && isset($data['playlists'], $data['tracks']) && is_array($data['playlists']) && is_array($data['tracks']) ? $data : null;
    }

    private static function playlistMutation(callable $fn) {
        if (self::hasMySQL() || PlaylistSql::enabled() || self::$batchDepth > 0) return false;
        return self::locked(function() use ($fn) {
            self::init();
            $data = self::freshData();
            if ($data === null) return false;
            self::$readBase = $data;
            self::$memoryCache = $data;
            $result = $fn($data);
            if ($result === false || $result === 'already_in_playlist') return $result;
            return self::write($data, true) ? $result : false;
        });
    }


    private static function resolvePaths(): void {
        if (self::$dataFile !== null) return;
        $dir = cachy_data_dir();
        self::$dataFile = $dir . DIRECTORY_SEPARATOR . 'library.json';
        self::$sqliteFile = $dir . DIRECTORY_SEPARATOR . 'library.sqlite';
        // The platform resolver already selects an existing portable data directory
        // when no override is given. An explicit override must remain isolated;
        // copying a legacy library here could silently mix different profiles.
    }

    public static function hasMySQL() {
        return isset($GLOBALS['connection']) && $GLOBALS['connection'] && function_exists('mysqli_connect_errno') && !@mysqli_connect_errno();
    }

    public static function hasSqlite(): bool {
        return class_exists('SQLite3');
    }

    public static function getDriver(): string {
        if (self::hasMySQL()) return 'mysql';
        if (self::hasSqlite()) return 'sqlite3';
        return 'json';
    }

    private static function initSqlite(): void {
        if (!self::hasSqlite() || self::$sqlite !== null) return;
        self::resolvePaths();
        try {
            $db = new SQLite3(self::$sqliteFile);
            $db->busyTimeout(2500);
            @$db->exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON;');
            $db->exec("
                CREATE TABLE IF NOT EXISTS Meta (k TEXT PRIMARY KEY, v TEXT);
                CREATE TABLE IF NOT EXISTS Tracks (
                    tid INTEGER PRIMARY KEY, file_path TEXT UNIQUE, full_path TEXT,
                    title TEXT, artist TEXT, album TEXT, genre TEXT, year INTEGER,
                    track_num TEXT, duration REAL, bitrate INTEGER, sample_rate INTEGER,
                    channels INTEGER, bit_depth INTEGER DEFAULT 16, format TEXT,
                    file_size INTEGER, mtime INTEGER, has_cover INTEGER DEFAULT 0,
                    lyrics TEXT, replay_gain REAL, replay_peak REAL
                );
                CREATE TABLE IF NOT EXISTS Playlists (plid INTEGER PRIMARY KEY, username TEXT, name TEXT, tracks_json TEXT);
                CREATE TABLE IF NOT EXISTS SoulseekAccount (id INTEGER PRIMARY KEY, username TEXT, password TEXT, is_powered_on INTEGER, downloads_dir TEXT, shared_dir TEXT);
                CREATE TABLE IF NOT EXISTS Accounts (id INTEGER PRIMARY KEY, username TEXT UNIQUE, password TEXT, created_at TEXT);
            ");
            self::$sqlite = $db;
        } catch (Throwable $e) {
            self::$sqlite = null;
        }
    }

    private static function syncSqliteFromData(array $data): void {
        self::initSqlite();
        if (self::$sqlite === null) return;
        $db = self::$sqlite;
        try {
            $db->exec('BEGIN IMMEDIATE');
            $stmt = $db->prepare('REPLACE INTO Meta (k, v) VALUES (:k, :v)');
            $stmt->bindValue(':k', 'default_directory', SQLITE3_TEXT);
            $stmt->bindValue(':v', (string)($data['default_directory'] ?? ''), SQLITE3_TEXT);
            $stmt->execute();

            $s = $data['soulseek'] ?? [];
            $sStmt = $db->prepare('REPLACE INTO SoulseekAccount (id, username, password, is_powered_on, downloads_dir, shared_dir) VALUES (1, :u, :p, :on, :dl, :sh)');
            $sStmt->bindValue(':u', (string)($s['username'] ?? ''), SQLITE3_TEXT);
            $sStmt->bindValue(':p', (string)($s['password'] ?? ''), SQLITE3_TEXT);
            $sStmt->bindValue(':on', (int)($s['is_powered_on'] ?? 0), SQLITE3_INTEGER);
            $sStmt->bindValue(':dl', (string)($s['downloads_dir'] ?? ''), SQLITE3_TEXT);
            $sStmt->bindValue(':sh', (string)($s['shared_dir'] ?? ''), SQLITE3_TEXT);
            $sStmt->execute();

            $db->exec('DELETE FROM Playlists');
            $pStmt = $db->prepare('INSERT INTO Playlists (plid, username, name, tracks_json) VALUES (:id, :u, :n, :t)');
            foreach ($data['playlists'] ?? [] as $pl) {
                $pStmt->bindValue(':id', (int)($pl['plid'] ?? 0), SQLITE3_INTEGER);
                $pStmt->bindValue(':u', (string)($pl['username'] ?? 'default'), SQLITE3_TEXT);
                $pStmt->bindValue(':n', (string)($pl['name'] ?? ''), SQLITE3_TEXT);
                $pStmt->bindValue(':t', json_encode($pl['tracks'] ?? []), SQLITE3_TEXT);
                $pStmt->execute();
                $pStmt->reset();
            }
            $db->exec('COMMIT');
        } catch (Throwable $e) {
            @$db->exec('ROLLBACK');
        }
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
            return self::write(self::$memoryCache, true);
        }
        return true;
    }

    public static function init() {
        self::resolvePaths();
        $dir = dirname(self::$dataFile);
        if (!is_dir($dir)) {
            @mkdir($dir, 0750, true);
        }
        $htaccess = $dir . '/.htaccess';
        if (!file_exists($htaccess)) {
            @file_put_contents($htaccess, "Order deny,allow\nDeny from all\n");
        }
        self::initSqlite();

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

            self::locked(function() use ($initData) { if (!file_exists(self::$dataFile)) { $tmp = @tempnam(dirname(self::$dataFile), 'lib_init_'); if ($tmp !== false) { $raw = json_encode($initData, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES); if ($raw === false || @file_put_contents($tmp,$raw) !== strlen($raw) || !@rename($tmp,self::$dataFile)) @unlink($tmp); } } });
        }
    }

    public static function read() {
        self::init();
        if ((self::$batchDepth > 0 || self::$isDirty) && self::$memoryCache !== null) return self::$memoryCache;
        $data = self::freshData();
        self::$readBase = $data;
        self::$memoryCache = $data;
        self::$pathToTidIndex = null;
        return $data ?? [];
    }

    public static function write($data, $forceFlush = false) {
        self::init();
        if (!is_array($data) || self::$readBase === null) return false;
        if (self::$batchDepth > 0 && !$forceFlush) {
            self::$memoryCache = $data; self::$isDirty = true; return true;
        }
        return self::locked(function() use ($data) {
            $fresh = self::freshData();
            if ($fresh === null) return false;
            $base = self::$readBase;
            // Merge independent top-level changes, reject conflicts rather than
            // allowing a stale scan or other writer to replace playlist data.
            foreach (array_unique(array_merge(array_keys($base),array_keys($data))) as $key) {
                if (array_key_exists($key,$base) === array_key_exists($key,$data) && ($base[$key]??null) === ($data[$key]??null)) continue;
                if (array_key_exists($key,$base) !== array_key_exists($key,$fresh) || ($base[$key]??null) !== ($fresh[$key]??null)) return false;
                if (array_key_exists($key,$data)) $fresh[$key] = $data[$key]; else unset($fresh[$key]);
            }
            $json = json_encode($fresh, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
            if ($json === false) return false;
            $temp = @tempnam(dirname(self::$dataFile), 'lib_tmp_');
            if ($temp === false) return false;
            try {
                if (@file_put_contents($temp,$json,LOCK_EX) !== strlen($json)) return false;
                @chmod($temp,0640);
                // Never copy over the existing file after a failed atomic replace.
                if (!@rename($temp,self::$dataFile)) return false;
            } finally { if (is_file($temp)) @unlink($temp); }
            self::$memoryCache = self::$readBase = $fresh;
            self::$isDirty = false;
            self::syncSqliteFromData($fresh);
            return true;
        });
    }

    // --- DEFAULT DIRECTORY ---
    public static function getDefaultDirectory() {
        $isPlaceholder = function($path) {
            $trimmed = trim((string)$path);
            return ($trimmed === '');
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
        if (PlaylistSql::enabled()&&!self::hasMySQL()) throw new RuntimeException("Configured playlist database unavailable");
        if (self::hasMySQL()) {
            $conn = $GLOBALS['connection'];
            $revision = PlaylistSql::enabled() ? ",p.revision" : "";
            $query = "SELECT p.plid,p.playlist_name,p.username $revision,pt.tid FROM Playlists p LEFT JOIN PlaylistTracks pt ON p.plid=pt.plid WHERE p.username=? OR p.username='default' ORDER BY p.plid,pt.position,pt.ptid";
            $stmt=$conn->prepare($query);
            if($stmt){$stmt->bind_param('s',$username);if(!$stmt->execute())throw new RuntimeException('MySQL playlist read failed');$res=$stmt->get_result();$playlists=[];
                while($row=$res->fetch_assoc()){$id=(int)$row['plid'];if(!isset($playlists[$id]))$playlists[$id]=['plid'=>$id,'name'=>$row['playlist_name'],'username'=>$row['username'],'tracks'=>[],'track_count'=>0,'revision'=>(int)($row['revision']??0)];if($row['tid']!==null){$playlists[$id]['tracks'][]=(int)$row['tid'];$playlists[$id]['track_count']++;}}
                return array_values($playlists);
            }
            throw new RuntimeException("MySQL playlist read failed");
        }

        $data = self::read();
        if (self::$readBase === null) throw new RuntimeException("Playlist storage unreadable");
        $playlists = [];
        foreach ($data['playlists'] ?? [] as $pl) {
            if ($pl['username'] === $username || $pl['username'] === 'default') {
                $playlists[] = [
                    'plid'        => (int)$pl['plid'],
                    'name'        => $pl['name'],
                    'username'    => $pl['username'],
                    'track_count' => count($pl['tracks'] ?? []),
                    'tracks' => array_values($pl['tracks'] ?? []), 'revision' => (int)($pl['revision']??0)
                ];
            }
        }
        return $playlists;
    }

    private static function playlistTrackIds($plid) {
        $stmt=$GLOBALS['connection']->prepare("SELECT tid FROM PlaylistTracks WHERE plid=? ORDER BY position,ptid");
        $stmt->bind_param('i',$plid);$stmt->execute();$ids=[];$rows=$stmt->get_result();while($row=$rows->fetch_assoc())$ids[]=(int)$row['tid'];return $ids;
    }

    public static function editPlaylist($plid,$name,$tracks,$username='default',$revision=null,$changeMembership=false) {
        if(self::hasMySQL())return PlaylistSql::mutate($GLOBALS['connection'],$changeMembership?'edit_members':'edit',['plid'=>$plid,'name'=>$name,'tracks'=>$tracks,'revision'=>$revision],$username);
        $plid=(int)$plid; $name=trim($name);
        if($plid<=0 || $name==='' || strlen($name)>200 || !is_array($tracks)) return false;
        foreach($tracks as $id) if(!self::validPlaylistId($id)) return false;
        $tracks=array_map('intval',$tracks);
        if(count(array_unique($tracks))!==count($tracks)) return false;
        return self::playlistMutation(function(&$data) use($plid,$name,$tracks,$username,$revision,$changeMembership) {
            foreach($data['playlists'] as $other) if((int)$other['plid']!==$plid && self::playlistOwner($other,$username) && strcasecmp($other['name'],$name)===0) return false;
            foreach($data['playlists'] as &$pl) if((int)$pl['plid']===$plid && self::playlistOwner($pl,$username)) {
                $old=array_map('intval',$pl['tracks']??[]); $a=$old; $b=$tracks; sort($a); sort($b);
                if((!$changeMembership && $a!==$b) || !self::validRevision($revision) || (int)$revision!==(int)($pl['revision']??0)) return false;
                if($changeMembership) foreach(array_diff($tracks,$old) as $tid) if(!isset($data['tracks'][(string)$tid])) return false;
                $pl['name']=$name; $pl['tracks']=$tracks; $pl['revision']=(int)($pl['revision']??0)+1; return true;
            }
            return false;
        });
    }

    private static function playlistOwner($pl,$username) { return in_array($pl['username']??'',[$username,'default'],true); }
    private static function validRevision($value) { return (is_int($value)||is_string($value)) && preg_match('/^(0|[1-9][0-9]*)$/D',(string)$value) && filter_var($value,FILTER_VALIDATE_INT)!==false; }
    private static function validPlaylistId($id) { return (is_int($id)||is_string($id)) && preg_match('/^[1-9][0-9]*$/D',(string)$id) && filter_var($id,FILTER_VALIDATE_INT)!==false; }

    public static function getPlaylist($plid) {
        $plid = (int)$plid;
        if (PlaylistSql::enabled()&&!self::hasMySQL()) throw new RuntimeException("Configured playlist database unavailable");
        if (self::hasMySQL()) {
            $conn = $GLOBALS['connection'];
            // One statement provides one consistent playlist/membership snapshot.
            // A separate metadata query could observe a different revision.
            $revision = PlaylistSql::enabled() ? ',p.revision' : '';
            $stmt = $conn->prepare("SELECT p.plid,p.playlist_name AS name,p.username $revision,
                pt.ptid,pt.tid,pt.position,t.file_path,t.full_path,t.title,t.artist,t.album,
                t.genre,t.year,t.track_num AS track,t.duration,t.bitrate,t.sample_rate AS sampleRate,
                t.channels,t.format,t.file_size AS size,t.has_cover AS hasCover,t.lyrics
                FROM Playlists p LEFT JOIN PlaylistTracks pt ON p.plid=pt.plid
                LEFT JOIN Tracks t ON pt.tid=t.tid
                WHERE p.plid=? ORDER BY pt.position,pt.ptid");
            if (!$stmt) throw new RuntimeException('MySQL playlist read failed');
            try {
                if (!$stmt->bind_param('i',$plid) || !$stmt->execute()) throw new RuntimeException('MySQL playlist read failed');
                $result=$stmt->get_result();
                if (!$result) throw new RuntimeException('MySQL playlist read failed');
                $playlist=null;
                while ($row=$result->fetch_assoc()) {
                    if ($playlist===null) $playlist=['plid'=>(int)$row['plid'],'name'=>$row['name'],'username'=>$row['username'],'revision'=>(int)($row['revision']??0),'tracks'=>[]];
                    if ($row['ptid']===null || $row['file_path']===null) continue;
                    unset($row['plid'],$row['name'],$row['username'],$row['revision']);
                    $row['hasCover']=(bool)$row['hasCover'];
                    $row['cover']=$row['hasCover']?'php/api/cover.php?tid='.$row['tid']:null;
                    $row['src']='php/api/stream.php?tid='.$row['tid'];
                    $playlist['tracks'][]=$row;
                }
                return $playlist;
            } finally { $stmt->close(); }
        }

        $data = self::read();
        if (self::$readBase === null) throw new RuntimeException("Playlist storage unreadable");
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
                            'src' => 'php/api/stream.php?tid=' . (int)$t['tid']
                        ];
                        $pos++;
                    }
                }
                return [
                    'plid' => (int)$pl['plid'],
                    'name' => $pl['name'],
                    'username' => $pl['username'],
                    'revision' => (int)($pl['revision']??0),
                    'tracks' => $tracks
                ];
            }
        }
        return null;
    }

    public static function createPlaylist($name, $username = 'default',$tracks=[])  {
        if(self::hasMySQL())return PlaylistSql::mutate($GLOBALS['connection'],'create',['name'=>$name,'tracks'=>$tracks],$username);
        $name=trim($name); if(!is_array($tracks))return false;foreach($tracks as $id)if(!self::validPlaylistId($id))return false;$tracks=array_map('intval',$tracks);if(count(array_unique($tracks))!==count($tracks))return false; if($name==='' || strlen($name)>200) return false;
        return self::playlistMutation(function(&$data) use($name,$username,$tracks) {
            foreach($tracks as $tid)if(!isset($data['tracks'][(string)$tid]))return false;
            $max=(int)($data['playlist_id_highwater']??0);
            foreach($data['playlists'] as $pl) {
                if(self::playlistOwner($pl,$username) && strcasecmp($pl['name'],$name)===0) return false;
                $max=max($max,(int)$pl['plid']);
            }
            // Legacy allocator never recorded deleted IDs. Start above ordinary
            // legacy IDs, then persist the high-water mark even after deletion.
            $id=max($max+1,(int)floor(microtime(true)*1000));
            if($id>9007199254740991) return false;
            $data['playlist_id_highwater']=$id;
            $data['playlists'][]=['plid'=>$id,'name'=>$name,'username'=>$username,'tracks'=>$tracks,'revision'=>0];
            return $id;
        });
    }
    public static function deletePlaylist($plid,$username='default',$revision=null) {
        if(self::hasMySQL())return PlaylistSql::mutate($GLOBALS['connection'],'delete',['plid'=>$plid,'revision'=>$revision],$username);
        return self::playlistMutation(function(&$data) use($plid,$username,$revision) {
            foreach($data['playlists'] as $i=>$pl) if((int)$pl['plid']===(int)$plid && self::playlistOwner($pl,$username)) {
                if(!self::validRevision($revision) || (int)$revision!==(int)($pl['revision']??0)) return false;
                $data['playlist_id_highwater']=max((int)($data['playlist_id_highwater']??0),(int)$plid);
                array_splice($data['playlists'],$i,1); return true;
            } return false;
        });
    }
    public static function addTrackToPlaylist($plid,$tid,$username='default') {
        if(self::hasMySQL())return PlaylistSql::mutate($GLOBALS['connection'],'add_track',['plid'=>$plid,'tid'=>$tid],$username);
        if(!self::validPlaylistId($plid)||!self::validPlaylistId($tid)) return false;
        return self::playlistMutation(function(&$data) use($plid,$tid,$username) {
            $tid=(int)$tid; if(!isset($data['tracks'][(string)$tid])) return false;
            foreach($data['playlists'] as &$pl) if((int)$pl['plid']===(int)$plid && self::playlistOwner($pl,$username)) {
                if(in_array($tid,array_map('intval',$pl['tracks']??[]),true)) return 'already_in_playlist';
                $pl['tracks'][]=$tid; $pl['revision']=(int)($pl['revision']??0)+1; return true;
            } return false;
        });
    }
    public static function addTracksToPlaylist($plid,$tracks,$username='default',$revision=null) {
        if(self::hasMySQL())return PlaylistSql::mutate($GLOBALS['connection'],'add_tracks',['plid'=>$plid,'tracks'=>$tracks,'revision'=>$revision],$username);
        if(!self::validPlaylistId($plid)||!self::validRevision($revision)||!is_array($tracks)||!count($tracks))return false;
        foreach($tracks as $id)if(!self::validPlaylistId($id))return false;
        $tracks=array_map('intval',$tracks);if(count(array_unique($tracks))!==count($tracks))return false;
        return self::playlistMutation(function(&$data) use($plid,$tracks,$username,$revision) {
            foreach($tracks as $tid)if(!isset($data['tracks'][(string)$tid]))return false;
            foreach($data['playlists'] as &$pl)if((int)$pl['plid']===(int)$plid&&self::playlistOwner($pl,$username)){
                if((int)($pl['revision']??0)!==(int)$revision)return false;
                $old=array_map('intval',$pl['tracks']??[]);if(array_intersect($old,$tracks))return false;
                $pl['tracks']=array_merge($old,$tracks);$pl['revision']=(int)($pl['revision']??0)+1;return true;
            }return false;
        });
    }

    public static function removeTrackFromPlaylist($plid,$tid,$username='default') {
        if(self::hasMySQL())return PlaylistSql::mutate($GLOBALS['connection'],'remove_track',['plid'=>$plid,'tid'=>$tid],$username);
        if(!self::validPlaylistId($plid)||!self::validPlaylistId($tid)) return false;
        return self::playlistMutation(function(&$data) use($plid,$tid,$username) {
            foreach($data['playlists'] as &$pl) if((int)$pl['plid']===(int)$plid && self::playlistOwner($pl,$username)) {
                $old=$pl['tracks']??[]; $new=array_values(array_filter($old,fn($t)=>(int)$t!==(int)$tid));
                if(count($new)===count($old)) return false;
                $pl['tracks']=$new; $pl['revision']=(int)($pl['revision']??0)+1; return true;
            } return false;
        });
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

    public static function getTrackByPath($fullPath) {
        if (empty($fullPath)) return null;
        $normTarget = cachy_normalize_path((string)$fullPath);
        $data = self::read();
        foreach ($data['tracks'] ?? [] as $t) {
            $fp = cachy_normalize_path((string)($t['full_path'] ?? $t['file_path'] ?? ''));
            if ($fp === $normTarget) return $t;
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
        // Credentials are session-only. Do not re-persist legacy encrypted passwords.
        $cfg['password'] = '';
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
