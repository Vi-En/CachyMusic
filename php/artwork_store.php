<?php
require_once __DIR__ . '/platform.php';
require_once __DIR__ . '/durable_file.php';
require_once __DIR__ . '/profile_budget.php';

// The directory is a permanent indication that this track may have an edit.
// It precedes any JSON reference, so an abandoned stage is never visible.
function cm_artwork_dir(int $tid): string {
    return cachy_data_dir() . DIRECTORY_SEPARATOR . 'artwork-' . $tid;
}
// Immutable edits are authoritative data, not a disposable cache. Admit new
// objects under a shared bounded inventory; never evict old user data.
function cm_artwork_limit(string $name,int $default,int $max): ?int {
    $raw=getenv($name);if ($raw===false||$raw==='') return $default;
    $v=filter_var($raw,FILTER_VALIDATE_INT,['options'=>['min_range'=>0,'max_range'=>$max]]);
    return $v===false?null:$v;
}
function cm_artwork_stage(int $tid, string $bytes): ?string {
    if ($tid <= 0 || strlen($bytes) > 10 * 1024 * 1024) return null;
    $info = @getimagesizefromstring($bytes);
    if (!$info || !in_array($info['mime'], ['image/png','image/jpeg'], true) || $info[0] < 1 || $info[1] < 1 || $info[0] > 8192 || $info[1] > 8192 || $info[0] * $info[1] > 16000000) return null;
    $hash=hash('sha256',$bytes);$dir=cm_artwork_dir($tid);$file=$dir.DIRECTORY_SEPARATOR.$hash.'.img';
    if (cm_artwork_read($tid,$hash)!==null) return $hash;
    $root=cachy_data_dir();$lockPath=$root.DIRECTORY_SEPARATOR.'artwork-admission.lock';
    $lock=cm_open_sidecar_lock($lockPath);if (!$lock) return null;
    try {
        if (!flock($lock,LOCK_EX|LOCK_NB)||!cm_regular_descriptor($lock,$lockPath)) return null;
        if (cm_artwork_read($tid,$hash)!==null) return $hash;
        $maxBytes=cm_artwork_limit('CACHYMUSIC_ARTWORK_STORE_BYTES',1073741824,PHP_INT_MAX>2147483647?17179869184:2147483647);
        $maxEntries=cm_artwork_limit('CACHYMUSIC_ARTWORK_STORE_ENTRIES',8192,32768);
        if ($maxBytes===null||$maxEntries===null) return null;
        $size=strlen($bytes);$count=1;$visited=0;$deadline=hrtime(true)+1000000000;
        foreach (new FilesystemIterator($root,FilesystemIterator::SKIP_DOTS) as $entry) {
            if (++$visited>65536||hrtime(true)>$deadline) return null;
            if (!preg_match('/^artwork-[1-9][0-9]*$/D',$entry->getFilename())) continue;
            if ($entry->isLink()||!$entry->isDir()) return null;
            foreach (new FilesystemIterator($entry->getPathname(),FilesystemIterator::SKIP_DOTS) as $item) {
                if (++$visited>65536||hrtime(true)>$deadline) return null;
                clearstatcache(true,$item->getPathname());$stat=@lstat($item->getPathname());
                if (!cm_regular_stat($stat)) return null;
                // Count every regular file here, including abandoned stages.
                // An atomic replacement temporarily requires both old and new bytes.
                $size+=$stat['size'];$count++;
                if ($size>$maxBytes||$count>$maxEntries) return null;
            }
        }
        if ($size>$maxBytes||$count>$maxEntries) return null;
        if (!is_dir($dir)&&!@mkdir($dir,0700)&&!is_dir($dir)) return null;
        if (is_link($dir)) return null;
        cm_sync_directory(dirname($dir));
        clearstatcache(true,$file);$named=@lstat($file);
        if ($named!==false&&!cm_regular_stat($named)) return null;
        return cm_profile_replace_file($file,$bytes)?$hash:null;
    } catch(Throwable $e) {return null;} finally {fclose($lock);}
}
function cm_artwork_read(int $tid, string $hash): ?array {
    if (!preg_match('/^[a-f0-9]{64}$/D', $hash)) return null;
    $dir = cm_artwork_dir($tid);
    $file = $dir . DIRECTORY_SEPARATOR . $hash . '.img';
    if (is_link($dir) || is_link($file) || !is_file($file)) return null;
    $st=@lstat($file);
    if (!$st || ($st['mode']&0170000)!==0100000 || $st['nlink']!==1 || $st['size']>10*1024*1024) return null;
    $h=@fopen($file,'rb');if (!$h) return null;
    try {$bytes=cm_regular_descriptor($h,$file)?stream_get_contents($h,10*1024*1024+1):false;}
    finally {fclose($h);}
    if ($bytes === false || strlen($bytes) > 10 * 1024 * 1024 || hash('sha256', $bytes) !== $hash) return null;
    $info = @getimagesizefromstring($bytes);
    if (!$info || !in_array($info['mime'], ['image/png','image/jpeg'], true) || $info[0]<1 || $info[1]<1 || $info[0]>8192 || $info[1]>8192 || $info[0]*$info[1]>16000000) return null;
    return ['bytes'=>$bytes, 'mime'=>$info['mime']];
}
