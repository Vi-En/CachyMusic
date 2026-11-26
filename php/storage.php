<?php
// CachyMusic - Zero-Dependency Unified Storage Engine (v2.0.0)
// Cross-platform persistence in cachy_data_dir() via SQLite3 WAL (when loaded) + POSIX atomic JSON, with MySQL sync when available.

require_once(__DIR__ . '/platform.php');
require_once(__DIR__ . '/media_access.php');
require_once(__DIR__ . '/recording_leases.php');
require_once(__DIR__ . '/artwork_store.php');
require_once(__DIR__ . '/playlist-sql.php');

class Storage {
    private static $dataFile = null;
    private static $sqliteFile = null;
    private static $sqlite = null;
    private static $memoryCache = null;
    private static $memoryCacheMtime = 0;
    private static $batchDepth = 0;
    private static $sqlScan = null;
    private static $batchFailed = false;
    private static $isDirty = false;
    private static $pathToTidIndex = null;
    private static $readBase = null;
    private static $writeLock = null;

    // Lock a stable sidecar inode, not the JSON inode replaced by rename.
    private static function locked(callable $fn) {
        if (self::$writeLock !== null) return $fn();
        self::resolvePaths();
        $lockPath=self::$dataFile.'.lock';
        $lock=cm_open_sidecar_lock($lockPath);
        if (!$lock) return false;
        $deadline = hrtime(true) + 3000000000;
        while (!@flock($lock, LOCK_EX | LOCK_NB)) {
            if (hrtime(true) >= $deadline) { fclose($lock); return false; }
            usleep(20000);
        }
        if (!cm_regular_descriptor($lock,$lockPath)) {fclose($lock);return false;}
        self::$writeLock = $lock;
        try { return $fn(); }
        finally { self::$writeLock = null; flock($lock, LOCK_UN); fclose($lock); }
    }

    public static function libraryByteLimit(): int {
        $value=getenv('CACHYMUSIC_LIBRARY_MAX_BYTES');
        if ($value===false||$value==='') return 67108864;
        $limit=filter_var($value,FILTER_VALIDATE_INT,['options'=>['min_range'=>1024,'max_range'=>67108864]]);
        if ($limit===false) throw new RuntimeException('Invalid library storage byte budget.');
        return $limit;
    }

    // Launcher preflight must be non-mutating and use the same bounded
    // descriptor policy as the authoritative JSON reader.
    public static function preflightLibrary(): bool {
        try {
            self::resolvePaths();self::libraryByteLimit();
            clearstatcache(true,self::$dataFile);
            if (@lstat(self::$dataFile)===false) return !is_link(self::$dataFile)&&!file_exists(self::$dataFile);
            $data=self::freshData();
            return $data!==null&&array_is_list($data['playlists']);
        } catch (Throwable $e) {return false;}
    }

    private static function freshData() {
        clearstatcache(true, self::$dataFile);
        $raw=false;$limit=self::libraryByteLimit();
        for ($attempt=0;$attempt<3;$attempt++) {
            clearstatcache(true,self::$dataFile);$named=@lstat(self::$dataFile);if (!cm_regular_stat($named)||$named['size']>$limit) return null;
            $h=@fopen(self::$dataFile,'rb');if (!$h) return null;
            try {if (cm_regular_descriptor($h,self::$dataFile)) {$raw=stream_get_contents($h,$limit+1);break;}}
            finally {fclose($h);}
        }
        return !is_string($raw)||strlen($raw)>$limit ? null : self::decodeLibrarySnapshot($raw);
    }

    // Pure decode for derived lookup caches. Does not set a write baseline.
    public static function decodeLibrarySnapshot(string $raw): ?array {
        if (strlen($raw)>self::libraryByteLimit()) return null;
        $data=json_decode($raw,true);
        return self::validData($data)?$data:null;
    }

    private static function validData($data): bool {
        return is_array($data) && isset($data['playlists'], $data['tracks']) && is_array($data['playlists']) && is_array($data['tracks']);
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
        if (self::$batchDepth === 0) {
            self::$batchFailed = false;
            self::read();
            if (self::$readBase === null) self::$batchFailed = true;
        }
        self::$batchDepth++;
        return !self::$batchFailed;
    }

    // SQL scans have a single authoritative transaction. The JSON mirror is
    // intentionally not a participant; old overlay records remain read-only.
    public static function beginScanBatch(): bool {
        if (!self::hasMySQL()) return self::beginBatch();
        if (self::$sqlScan !== null || self::$batchDepth !== 0) return false;
        $conn=$GLOBALS['connection'];
        // Refuse legacy nontransactional tables instead of promising rollback.
        $engines=mysqli_query($conn,"SELECT TABLE_NAME, ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('Tracks','DefaultDirectory')");
        if (!$engines) return false;
        $found=[];
        while ($r=mysqli_fetch_assoc($engines)) $found[$r['TABLE_NAME']]=strtoupper((string)$r['ENGINE']);
        if (($found['Tracks']??null)!=='INNODB'||($found['DefaultDirectory']??null)!=='INNODB') return false;
        if (!$conn->begin_transaction()) return false;
        self::$sqlScan=$conn; self::$batchFailed=false;
        try {
            // Ensure a singleton exists, then hold its row lock through publication.
            if (!mysqli_query($conn,"INSERT INTO DefaultDirectory (ddid,default_directory) VALUES (1,'') ON DUPLICATE KEY UPDATE ddid=ddid")) throw new RuntimeException('SQL root lock unavailable');
            $root=mysqli_query($conn,"SELECT default_directory FROM DefaultDirectory WHERE ddid=1 FOR UPDATE");
            if (!$root||!mysqli_fetch_assoc($root)) throw new RuntimeException('SQL root lock unavailable');
            return true;
        } catch (Throwable $e) { self::abortBatch(); return false; }
    }

    public static function commitScanBatch(): bool {
        if (self::$sqlScan===null) return self::commitBatch(true);
        $conn=self::$sqlScan;
        if (self::$batchFailed) { self::abortBatch(); return false; }
        // Connection loss during commit can leave the outcome uncertain. Never
        // retry here; the scanner reports failure and the owner must reconcile.
        try { $ok=$conn->commit(); } catch (Throwable $e) { $ok=false; }
        if (!$ok) { self::abortBatch(); return false; }
        self::$sqlScan=null;self::abortBatch();return true;
    }

    private static function rejectWrite(): bool {
        if (self::$batchDepth > 0 || self::$sqlScan!==null) self::$batchFailed = true;
        return false;
    }

    public static function commitBatch(bool $requireDirectoryStable = false) {
        if (self::$batchDepth === 0) return false;
        if (--self::$batchDepth > 0) return !self::$batchFailed;
        $ok = !self::$batchFailed;
        if ($ok && self::$isDirty) $ok = self::write(self::$memoryCache, true, $requireDirectoryStable);
        elseif ($ok) {
            // Cached scan results still carry track IDs. Reject a changed
            // track snapshot even when nothing needed to be written.
            $fresh = self::freshData();
            $ok = $fresh !== null && $fresh['tracks'] === self::$readBase['tracks'] && (!$requireDirectoryStable || ($fresh['default_directory']??'') === (self::$readBase['default_directory']??''));
        }
        // A failed commit must discard all provisional IDs and never be
        // mistaken for a successful second commit. Next batch reads fresh.
        self::$isDirty = false;
        self::$batchFailed = false;
        self::$memoryCache = self::$readBase = self::$pathToTidIndex = null;
        return $ok;
    }

    // Discard unpublished changes after a failed worker job. A CLI worker
    // processes multiple scans; request teardown no longer resets this state.
    public static function abortBatch(): void {
        if (self::$sqlScan!==null) { $conn=self::$sqlScan;self::$sqlScan=null;try {$conn->rollback();} catch (Throwable $e) {} }
        self::$batchDepth=0; self::$batchFailed=false; self::$isDirty=false;
        self::$memoryCache=self::$readBase=self::$pathToTidIndex=null;
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

        if (!file_exists(self::$dataFile)&&!is_link(self::$dataFile)) {
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

            self::locked(function() use ($initData) {
                if (!file_exists(self::$dataFile)&&!is_link(self::$dataFile)) {
                    $raw = json_encode($initData, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
                    if ($raw !== false&&strlen($raw)<=self::libraryByteLimit()) cm_profile_replace_file(self::$dataFile, $raw, 0640);
                }
            });
        }
    }

    public static function read() {
        self::init();
        if (self::$batchDepth > 0) return self::$memoryCache ?? [];
        $data = self::freshData();
        self::$readBase = $data;
        self::$memoryCache = $data;
        self::$pathToTidIndex = null;
        return $data ?? [];
    }

    public static function write($data, $forceFlush = false, bool $requireDirectoryStable = false, ?array $expectedAuthority = null) {
        self::init();
        if (!self::validData($data) || self::$readBase === null || (self::$batchDepth > 0 && self::$batchFailed)) return self::rejectWrite();
        if (self::$batchDepth > 0 && !$forceFlush) {
            self::$memoryCache = $data; self::$isDirty = true; return true;
        }
        return self::locked(function() use ($data, $requireDirectoryStable, $expectedAuthority) {
            $fresh = self::freshData();
            if ($fresh === null) return false;
            $base = self::$readBase;
            if ($expectedAuthority !== null && cm_media_authority($fresh) !== $expectedAuthority) return false;
            if ($requireDirectoryStable && (($fresh['default_directory']??'') !== ($base['default_directory']??'') || $fresh['tracks'] !== $base['tracks'])) return false;
            $oldAuthority = cm_media_authority($fresh);
            // Merge independent top-level changes, reject conflicts rather than
            // allowing a stale scan or other writer to replace playlist data.
            foreach (array_unique(array_merge(array_keys($base),array_keys($data))) as $key) {
                if (array_key_exists($key,$base) === array_key_exists($key,$data) && ($base[$key]??null) === ($data[$key]??null)) continue;
                if (array_key_exists($key,$base) !== array_key_exists($key,$fresh) || ($base[$key]??null) !== ($fresh[$key]??null)) return false;
                if (array_key_exists($key,$data)) $fresh[$key] = $data[$key]; else unset($fresh[$key]);
            }
            if (!self::validData($fresh)) return false;
            $json = json_encode($fresh, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
            if ($json === false||strlen($json)>self::libraryByteLimit()) return false;
            $authorityGuard = null;
            if (!self::hasMySQL() && $oldAuthority !== cm_media_authority($fresh)) {
                $authorityGuard = cm_recording_authority_change_guard();
                if (!$authorityGuard) return false;
            }
            try {
                if (!cm_profile_replace_file(self::$dataFile, $json, 0640)) return false;
                self::$memoryCache = self::$readBase = $fresh;
                self::$isDirty = false;
                self::syncSqliteFromData($fresh);
                return true;
            } finally {if (is_resource($authorityGuard)) fclose($authorityGuard);}
        });
    }

    // --- DEFAULT DIRECTORY ---
    public static function getDefaultDirectory() {
        if (self::hasMySQL()) {
            $res=mysqli_query($GLOBALS['connection'],"SELECT default_directory FROM DefaultDirectory WHERE ddid = 1 LIMIT 1");
            if (!$res) throw new RuntimeException('SQL directory lookup failed');
            $row=mysqli_fetch_assoc($res);
            return trim((string)($row['default_directory']??''));
        }
        $data=self::read();return trim((string)($data['default_directory']??''));
    }

    public static function setDefaultDirectory($dir) {
        $dir = trim($dir);
        if (self::hasMySQL()) {
            $conn = $GLOBALS['connection'];
            $stmt = $conn->prepare("INSERT INTO DefaultDirectory (ddid, default_directory) VALUES (1, ?) ON DUPLICATE KEY UPDATE default_directory = VALUES(default_directory)");
            if (!$stmt) return self::rejectWrite();
            try {if (!$stmt->bind_param("s",$dir)||!$stmt->execute()) return self::rejectWrite();}
            finally {$stmt->close();}
            return true; // SQL root is authoritative; do not publish a JSON mirror.
        }

        $data = self::read();
        if (self::$readBase === null) return self::rejectWrite();
        if (($data['default_directory'] ?? '') === $dir) {
            return true;
        }
        $data['default_directory'] = $dir;
        return self::write($data);
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
            $conn=$GLOBALS['connection'];$prefix=$searchPrefix.'%';
            $stmt=$conn->prepare("SELECT tid, file_path, full_path, title, artist, album, genre, year, track_num, duration, bitrate, sample_rate, channels, bit_depth, format, file_size, mtime, has_cover, lyrics FROM Tracks WHERE full_path LIKE ? OR file_path LIKE ?");
            if (!$stmt) throw new RuntimeException('SQL track lookup failed');
            try {
                if (!$stmt->bind_param("ss",$prefix,$prefix)||!$stmt->execute()||!($res=$stmt->get_result())) throw new RuntimeException('SQL track lookup failed');
                $ambiguous=[];
                while ($row=$res->fetch_assoc()) {
                    $key=$row['full_path']?:$row['file_path'];
                    if ($key===''||($searchPrefix!==''&&!str_starts_with($key,$searchPrefix))) continue;
                    if (isset($cached[$key])) {unset($cached[$key]);$ambiguous[$key]=true;}
                    elseif (!isset($ambiguous[$key])) $cached[$key]=$row;
                }
                return $cached;
            } finally {$stmt->close();}
        }

        $data = self::read();
        $ambiguous = [];
        foreach ($data['tracks'] ?? [] as $t) {
            $fullPath = ($t['full_path'] ?? '') ?: ($t['file_path'] ?? '');
            if ($fullPath !== '' && (empty($searchPrefix) || str_starts_with($fullPath, $searchPrefix))) {
                if (isset($cached[$fullPath])) { unset($cached[$fullPath]); $ambiguous[$fullPath] = true; }
                elseif (!isset($ambiguous[$fullPath])) $cached[$fullPath] = $t;
            }
        }
        return $cached;
    }

    public static function upsertTrack($trackData) {
        $tid = null;
        $fullPath=($trackData['full_path']??'')?:($trackData['file_path']??'');
        if (!is_string($fullPath)||$fullPath==='') return self::rejectWrite();
        if (self::hasMySQL()) {
            if (self::$batchFailed) return self::rejectWrite();
            $conn=$GLOBALS['connection'];$ownTransaction=self::$sqlScan===null;
            if ($ownTransaction&&!$conn->begin_transaction()) return self::rejectWrite();
            $committed=false;
            try {
                $columns=['file_path','full_path','title','artist','album','genre','year','track_num','duration','bitrate','sample_rate','channels','bit_depth','format','file_size','mtime','has_cover','lyrics'];
                // A collated UNIQUE file_path may match a different spelling. Do
                // not mutate that row. Exact path identity is required even when
                // MySQL's collation treats distinct paths as equal.
                $same="BINARY file_path = BINARY VALUES(file_path) AND BINARY COALESCE(NULLIF(full_path,''),file_path) = BINARY COALESCE(NULLIF(VALUES(full_path),''),VALUES(file_path))";
                $assignments=["tid = IF($same, LAST_INSERT_ID(tid), tid)"];
                foreach (array_slice($columns,1) as $column) $assignments[]="$column = IF($same, VALUES($column), $column)";
                $stmt=$conn->prepare('INSERT INTO Tracks ('.implode(', ',$columns).') VALUES ('.implode(', ',array_fill(0,count($columns),'?')).') ON DUPLICATE KEY UPDATE '.implode(', ',$assignments));
                if (!$stmt) return self::rejectWrite();
                try {
                    $hasCoverInt=!empty($trackData['has_cover'])?1:0;
                    // All values are supplied, including nullable optional fields.
                    $values=[];foreach($columns as $key) $values[]=$key==='has_cover'?$hasCoverInt:($trackData[$key]??null);
                    if (!$stmt->bind_param("ssssssisdiiiisiiis",...$values)||!$stmt->execute()) return self::rejectWrite();
                    $tid=cachy_positive_id($conn->insert_id?:$stmt->insert_id);
                } finally {$stmt->close();}
                if ($tid===null||self::getTrackPath($tid)!==$fullPath) return self::rejectWrite();
                if ($ownTransaction&&!$conn->commit()) return self::rejectWrite();
                $committed=true;
                return $tid;
            } finally {
                if ($ownTransaction&&!$committed) try {$conn->rollback();} catch (Throwable $e) {}
            }
        }

        $data = self::read();
        if (self::$readBase === null || (self::$batchDepth > 0 && self::$batchFailed)) return self::rejectWrite();
        $fullPath = ($trackData['full_path'] ?? '') ?: ($trackData['file_path'] ?? '');
        if (!is_string($fullPath) || $fullPath === '') return self::rejectWrite();

        if (self::$pathToTidIndex === null) {
            self::$pathToTidIndex = ['byPath' => [], 'maxTid' => 0];
            foreach ($data['tracks'] as $existingTid => $t) {
                $numTid = (int)$existingTid;
                self::$pathToTidIndex['maxTid'] = max(self::$pathToTidIndex['maxTid'], $numTid);
                // Full paths are authoritative. A legacy basename is not an
                // alias for a different recording in a different directory.
                $path = ($t['full_path'] ?? '') ?: ($t['file_path'] ?? '');
                if ($path !== '') {
                    $index =& self::$pathToTidIndex['byPath'];
                    $index[$path] = array_key_exists($path, $index) ? false : $numTid;
                    unset($index);
                }
            }
        }

        if (!$tid) {
            $index = self::$pathToTidIndex['byPath'];
            if (array_key_exists($fullPath, $index)) {
                $tid = $index[$fullPath];
                if (!$tid) return self::rejectWrite(); // ambiguous legacy data
            } else {
                if (self::$pathToTidIndex['maxTid'] >= PHP_INT_MAX) return self::rejectWrite();
                $tid = ++self::$pathToTidIndex['maxTid'];
            }
            unset($index);
        } elseif ((int)$tid > self::$pathToTidIndex['maxTid']) {
            self::$pathToTidIndex['maxTid'] = (int)$tid;
        }

        $tid = (int)$tid;
        self::$pathToTidIndex['byPath'][$fullPath] = $tid;

        $existing = $data['tracks'][(string)$tid] ?? null;
        if ($existing!==null&&(($existing['full_path']??'')?:($existing['file_path']??''))!==$fullPath) return self::rejectWrite();
        if ($existing !== null && ($existing['mtime'] ?? 0) === ($trackData['mtime'] ?? 0) && ($existing['file_size'] ?? 0) === ($trackData['file_size'] ?? 0) && !empty($existing['title'])) {
            return $tid;
        }

        // A library-only artwork edit survives a rescan of the same path.
        if ($existing && (($existing['full_path'] ?? '') ?: ($existing['file_path'] ?? '')) === $fullPath && !empty($existing['artwork_hash'])) {
            $trackData['artwork_hash'] = $existing['artwork_hash'];
            $trackData['has_cover'] = 1;
        }
        $trackData['tid'] = $tid;
        $data['tracks'][(string)$tid] = $trackData;
        return self::write($data) ? $tid : false;
    }

    public static function getTrackPath($tid) {
        $tid = (int)$tid;
        if (self::hasMySQL()) {
            $stmt=$GLOBALS['connection']->prepare("SELECT full_path, file_path FROM Tracks WHERE tid = ? LIMIT 1");
            if (!$stmt) throw new RuntimeException('SQL track identity lookup failed');
            try {
                if (!$stmt->bind_param("i",$tid)||!$stmt->execute()||!($res=$stmt->get_result())) throw new RuntimeException('SQL track identity lookup failed');
                $row=$res->fetch_assoc();return $row?($row['full_path']?:$row['file_path']):null;
            } finally {$stmt->close();}
        }

        $data = self::read();
        $t = $data['tracks'][(string)$tid] ?? $data['tracks'][$tid] ?? null;
        if ($t) {
            return $t['full_path'] ?: $t['file_path'];
        }
        return null;
    }

    public static function getTrackByPath($fullPath) {
        if (!is_string($fullPath)||$fullPath==='') return null;
        if (self::hasMySQL()) {
            $stmt=$GLOBALS['connection']->prepare("SELECT tid, file_path, full_path, title, artist, album, genre, year, track_num, duration, bitrate, sample_rate, channels, bit_depth, format, file_size, mtime, has_cover, lyrics FROM Tracks WHERE BINARY COALESCE(NULLIF(full_path,''),file_path) = BINARY ? LIMIT 2");
            if (!$stmt) throw new RuntimeException('SQL path lookup failed');
            try {
                if (!$stmt->bind_param('s',$fullPath)||!$stmt->execute()||!($res=$stmt->get_result())) throw new RuntimeException('SQL path lookup failed');
                $row=$res->fetch_assoc();
                return $row&&cm_media_record_path($row)===$fullPath&&cachy_positive_id($row['tid']??null)!==null&&!$res->fetch_assoc()?$row:null;
            } finally {$stmt->close();}
        }
        $data = self::read();
        $match = null;
        foreach ($data['tracks'] ?? [] as $t) {
            $fp = ($t['full_path'] ?? '') ?: ($t['file_path'] ?? '');
            if ($fp === $fullPath) {
                if ($match !== null) return null;
                $match = $t;
            }
        }
        return $match;
    }

    // SQL metadata is authoritative. A local artwork/comment overlay is only
    // eligible when its recording identity matches the SQL row exactly.
    public static function sqlTrackRecord(int $tid, bool $forUpdate=false): ?array {
        if (!self::hasMySQL() || $tid<=0) return null;
        $conn=$GLOBALS['connection'];
        $stmt=$conn->prepare('SELECT tid, file_path, full_path, title, artist, album, genre, year, track_num, duration, bitrate, sample_rate, channels, bit_depth, format, file_size, mtime, has_cover, lyrics FROM Tracks WHERE tid = ? LIMIT 1'.($forUpdate?' FOR UPDATE':''));
        if (!$stmt) throw new RuntimeException('SQL metadata lookup failed');
        try {
            if (!$stmt->bind_param('i',$tid)||!$stmt->execute()||!($res=$stmt->get_result())) throw new RuntimeException('SQL metadata lookup failed');
            $row=$res->fetch_assoc();
            if (!$row) return null;
            if (cachy_positive_id($row['tid']??null)!==$tid||cm_media_record_path($row)===null) throw new RuntimeException('Invalid SQL recording identity');
            return $row;
        } finally {$stmt->close();}
    }

    // Supported SQL-only edits use a row transaction. Do not claim atomic
    // publication of SQL plus local artwork or original audio file contents.
    private static function updateSqlTrackMetadata(int $tid,array $fields,$expectedPath): array|false {
        if (array_key_exists('artwork_hash',$fields)||array_key_exists('comment',$fields)) return false;
        $conn=$GLOBALS['connection'];
        if (!$conn->begin_transaction()) return false;
        $committed=false;
        try {
            $row=self::sqlTrackRecord($tid,true);
            if (!$row||($expectedPath!==null&&cm_media_record_path($row)!==$expectedPath)) return false;
            $types='';$values=[];$assign=[];
            foreach (['title'=>'s','artist'=>'s','album'=>'s','genre'=>'s','year'=>'i','track_num'=>'s','lyrics'=>'s','has_cover'=>'i'] as $key=>$type) {
                if (!array_key_exists($key,$fields)) continue;
                $val=$fields[$key]===null?null:trim((string)$fields[$key]);
                if ($type==='i') $val=$key==='has_cover'?(int)!empty($fields[$key]):(is_numeric($val)?(int)$val:null);
                $assign[]="$key = ?";$types.=$type;$values[]=$val;$row[$key]=$val;
            }
            if ($assign) {
                $types.='i';$values[]=$tid;
                $stmt=$conn->prepare('UPDATE Tracks SET '.implode(', ',$assign).' WHERE tid = ?');
                if (!$stmt) return false;
                try {if (!$stmt->bind_param($types,...$values)||!$stmt->execute()) return false;}
                finally {$stmt->close();}
            }
            if (!$conn->commit()) return false;
            $committed=true;return $row;
        } finally {if (!$committed) $conn->rollback();}
    }

    public static function updateTrackMetadata($tid, $fields, $expectedPath = null, ?array $expectedAuthority = null, ?string $expectedRecord = null) {
        $tid = (int)$tid;
        if ($tid <= 0) return false;
        if (self::hasMySQL()) return self::updateSqlTrackMetadata($tid,$fields,$expectedPath);

        $data = self::read();
        if ($expectedAuthority !== null && cm_media_authority($data) !== $expectedAuthority) return false;
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
        if ($expectedRecord !== null && !hash_equals($expectedRecord,hash('sha256',json_encode($track,JSON_THROW_ON_ERROR)))) return false;

        if ($expectedPath !== null && (($track['full_path'] ?? '') ?: ($track['file_path'] ?? '')) !== $expectedPath) return false;
        if (array_key_exists('artwork_hash', $fields)) {
            if (!is_string($fields['artwork_hash']) || cm_artwork_read($tid, $fields['artwork_hash']) === null) return false;
            $fields['has_cover'] = 1;
        }
        $updatable = ['title', 'artist', 'album', 'genre', 'year', 'track_num', 'lyrics', 'comment', 'has_cover', 'artwork_hash'];
        $hasChanges = false;
        foreach ($updatable as $key) {
            if (array_key_exists($key, $fields)) {
                $val = trim((string)$fields[$key]);
                if ($key === 'year') {
                    $val = is_numeric($val) ? (int)$val : null;
                } elseif ($key === 'track_num') {
                    $val = $val === '' ? null : $val;
                } elseif ($key === 'has_cover') {
                    $val = !empty($fields[$key]) ? 1 : 0;
                }
                $track[$key] = $val;
                $hasChanges = true;
            }
        }

        if ($hasChanges) {
            $data['tracks'][$strTid] = $track;
            if (!self::write($data,false,false,$expectedAuthority)) return false;


        }

        return $track;
    }

    // --- SOULSEEK ACCOUNT ---
    public static function getSoulseekAccount() {
        if (self::hasMySQL()) {
            $res=mysqli_query($GLOBALS['connection'],"SELECT id, username, password, is_powered_on, downloads_dir, shared_dir FROM SoulseekAccount WHERE id = 1 LIMIT 1");
            if (!$res) throw new RuntimeException('SQL peer-directory lookup failed');
            return mysqli_fetch_assoc($res)?:['id'=>1,'username'=>'','password'=>'','is_powered_on'=>0,'downloads_dir'=>'','shared_dir'=>''];
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
        return self::write($data);
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
        return self::write($data) ? $newId : false;
    }
}
