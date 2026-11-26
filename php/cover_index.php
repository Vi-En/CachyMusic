<?php
require_once __DIR__ . '/durable_file.php';
require_once __DIR__ . '/cover_index_portable.php';

// Derived, private lookup buckets. The JSON library remains authoritative.
// All application JSON commits replace the inode. On platforms where inode
// identity is unreliable or for explicitly configured SQL, use the full read.
const CM_COVER_INDEX_LIMIT = 2097152;
const CM_COVER_INDEX_BUCKETS = 64;
function cm_cover_library_version(string $file): ?array {
    clearstatcache(true, $file);
    $stat = @lstat($file);
    if (!$stat || ($stat['mode'] & 0170000) !== 0100000 || $stat['nlink'] !== 1 || $stat['ino'] <= 0 || $stat['size'] > Storage::libraryByteLimit()) return null;
    return [$stat['dev'], $stat['ino'], $stat['size'], $stat['mtime'], $stat['ctime']];
}
function cm_cover_private_dir(string $dir): bool {
    clearstatcache(true, $dir);
    if (is_link($dir)) return false;
    if (!is_dir($dir) && !@mkdir($dir, 0700) && !is_dir($dir)) return false;
    clearstatcache(true, $dir);
    $stat = @lstat($dir);
    return $stat && ($stat['mode'] & 0170000) === 0040000 && ($stat['mode'] & 0077) === 0 && (!function_exists('posix_geteuid') || $stat['uid'] === posix_geteuid());
}
function cm_cover_index_read(string $file, array $version, int $bucket): ?array {
    clearstatcache(true, $file);
    $stat = @lstat($file);
    if (!$stat || ($stat['mode'] & 0170000) !== 0100000 || $stat['nlink'] !== 1 || ($stat['mode'] & 0077) !== 0 || $stat['size'] > CM_COVER_INDEX_LIMIT || (function_exists('posix_geteuid') && $stat['uid'] !== posix_geteuid())) return null;
    $h=@fopen($file,'rb');if (!$h) return null;
    try {
        $opened=@fstat($h);
        if (!cm_regular_descriptor($h,$file)||!$opened||($opened['mode']&0077)!==0||$opened['size']>CM_COVER_INDEX_LIMIT||(function_exists('posix_geteuid')&&$opened['uid']!==posix_geteuid())) return null;
        $raw=stream_get_contents($h,CM_COVER_INDEX_LIMIT+1);
        if (!cm_regular_descriptor($h,$file)) return null;
    } finally {fclose($h);}
    if (!is_string($raw) || strlen($raw) > CM_COVER_INDEX_LIMIT || strlen($raw) < 65 || $raw[64] !== "\n") return null;
    $payload = substr($raw, 65);
    if (!hash_equals(substr($raw, 0, 64), hash('sha256', $payload))) return null;
    $entry = json_decode($payload, true);
    if (!is_array($entry) || ($entry['version'] ?? null) !== $version || ($entry['bucket'] ?? null) !== $bucket) return null;
    $data = $entry['data'] ?? null;
    if (!is_array($data) || !isset($data['tracks'], $data['soulseek']) || !is_array($data['tracks']) || !is_array($data['soulseek']) || !is_string($data['default_directory'] ?? null)) return null;
    return $data;
}
function cm_cover_projection_base(array $data): ?array {
    if (!isset($data['tracks'])||!is_array($data['tracks'])||count($data['tracks'])>100000) return null;
    $directory=$data['default_directory']??'';$peer=$data['soulseek']??[];
    if (!is_string($directory)||!is_array($peer)) return null;
    $projection=['default_directory'=>$directory,'soulseek'=>[],'tracks'=>[]];
    foreach (['downloads_dir','shared_dir'] as $key) {
        $value=$peer[$key]??'';if (!is_string($value)) return null;$projection['soulseek'][$key]=$value;
    }
    return $projection;
}
function cm_cover_projection_row($track): ?array {
    if (!is_array($track)) return null;
    $row=[];
    foreach (['full_path','file_path','artwork_hash'] as $key) if (array_key_exists($key,$track)) {
        if ($track[$key]!==null&&(!is_string($track[$key])||strlen($track[$key])>4096)) return null;
        $row[$key]=$track[$key];
    }
    return $row;
}
function cm_cover_index_build(array $data,int $bucket): ?array {
    $projection=cm_cover_projection_base($data);if ($projection===null) return null;
    foreach ($data['tracks'] as $id=>$track) {
        $tid=cachy_positive_id($id);if ($tid===null||$tid%CM_COVER_INDEX_BUCKETS!==$bucket) continue;
        $row=cm_cover_projection_row($track);if ($row===null) return null;$projection['tracks'][$tid]=$row;
    }
    return $projection;
}
function cm_cover_snapshot(?int $tid): array {
    if (Storage::hasMySQL()) return Storage::read();
    if (cachy_is_windows()) return cm_portable_lookup_snapshot($tid);
    $root = cachy_data_dir();
    $library = $root . DIRECTORY_SEPARATOR . 'library.json';
    $version = cm_cover_library_version($library);
    $dir = $root . DIRECTORY_SEPARATOR . 'cover-index-v1';
    if ($version === null || !cm_cover_private_dir($dir)) return Storage::read();
    $bucket = ($tid ?? 0) % CM_COVER_INDEX_BUCKETS;
    $file = $dir . DIRECTORY_SEPARATOR . $bucket . '.idx';
    $hit = cm_cover_index_read($file, $version, $bucket);
    if ($hit !== null && cm_cover_library_version($library) === $version) return $hit;
    $data = Storage::read();
    // Never publish an index derived from a superseded or corrupt snapshot.
    if (cm_cover_library_version($library) !== $version) return $data;
    $projection = cm_cover_index_build($data, $bucket);
    if ($projection === null) return $data;
    $payload = json_encode(['version'=>$version, 'bucket'=>$bucket, 'data'=>$projection], JSON_UNESCAPED_SLASHES);
    if (is_string($payload) && strlen($payload) + 65 <= CM_COVER_INDEX_LIMIT && !is_link($file)) {
        // Concurrent builders can replace each other; a stale generation is
        // harmless because every read checks the current authoritative inode.
        cm_replace_file($file, hash('sha256', $payload) . "\n" . $payload);
    }
    return $projection;
}

// Build every bounded lookup bucket from one authoritative decode. The
// launcher worker calls this only while idle; ordinary request misses retain
// the existing one-bucket fallback, including when warming is interrupted.
function cm_cover_warm_generation(callable $shouldContinue): bool {
    if (cachy_is_windows()||Storage::hasMySQL()) return false;
    $root=cachy_data_dir();$library=$root.DIRECTORY_SEPARATOR.'library.json';
    $dir=$root.DIRECTORY_SEPARATOR.'cover-index-v1';$version=cm_cover_library_version($library);
    if ($version===null||$version[2]>67108864||!cm_cover_private_dir($dir)||!$shouldContinue()) return false;
    // A completed generation needs no decoding or fsyncs.
    $missing=[];
    for($i=0;$i<CM_COVER_INDEX_BUCKETS;$i++) {
        if (!$shouldContinue()) return false;
        if (cm_cover_index_read($dir.DIRECTORY_SEPARATOR.$i.'.idx',$version,$i)===null) $missing[$i]=true;
    }
    if (!$missing) return cm_cover_library_version($library)===$version;
    $data=Storage::read();
    if (cm_cover_library_version($library)!==$version) return false;
    $base=cm_cover_projection_base($data);if ($base===null) return false;
    $buckets=[];foreach($missing as $i=>$_) $buckets[$i]=$base;
    $n=0;
    foreach ($data['tracks'] as $id=>$track) {
        if (++$n%128===0&&!$shouldContinue()) return false;
        $tid=cachy_positive_id($id);if ($tid===null) continue;$i=$tid%CM_COVER_INDEX_BUCKETS;
        if (!isset($missing[$i])) continue;
        $row=cm_cover_projection_row($track);if ($row===null) return false;
        $buckets[$i]['tracks'][$tid]=$row;
    }
    unset($data);Storage::abortBatch();
    foreach ($buckets as $i=>$projection) {
        if (!$shouldContinue()||cm_cover_library_version($library)!==$version) return false;
        $file=$dir.DIRECTORY_SEPARATOR.$i.'.idx';$payload=json_encode(['version'=>$version,'bucket'=>$i,'data'=>$projection],JSON_UNESCAPED_SLASHES);
        if (!is_string($payload)||strlen($payload)+65>CM_COVER_INDEX_LIMIT||is_link($file)||!cm_replace_file($file,hash('sha256',$payload)."\n".$payload)) return false;
    }
    return cm_cover_library_version($library)===$version;
}
