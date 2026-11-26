<?php
require_once __DIR__.'/durable_file.php';
// Admission control for disposable cover derivatives only. Never inspect or
// evict authoritative artwork, legacy tid_* files, aliases or unknown files.
function cm_cover_cache_name(string $name): bool {
    return preg_match('/^(?:[a-f0-9]{64}(?:\.img|_thumb\.jpg|\.none)|edit-[a-f0-9]{64}-128\.jpg)$/D',$name)===1;
}
function cm_cover_cache_stat(string $file): ?array {
    clearstatcache(true,$file);$s=@lstat($file);
    return $s&&($s['mode']&0170000)===0100000&&$s['nlink']===1?$s:null;
}
function cm_cover_cache_limit(string $key,int $default,int $max): ?int {
    $raw=getenv($key);if ($raw===false||$raw==='') return $default;
    $v=filter_var($raw,FILTER_VALIDATE_INT,['options'=>['min_range'=>0,'max_range'=>$max]]);
    return $v===false?null:$v;
}
function cm_cover_cache_publish(string $target,string $bytes): bool {
    return cm_cover_cache_enforce(dirname($target),$target,$bytes);
}
// Managed idle maintenance also trims existing recognized entries, even if no
// new artwork request is made. Shared lock and identity checks are unchanged.
function cm_cover_cache_trim(string $dir): bool {
    return cm_cover_cache_enforce($dir,null,'');
}
function cm_cover_cache_enforce(string $dir,?string $target,string $bytes): bool {
    $name=$target===null?null:basename($target);
    $byteLimit=cm_cover_cache_limit('CACHYMUSIC_COVER_CACHE_BYTES',268435456,2147483647);
    $entryLimit=cm_cover_cache_limit('CACHYMUSIC_COVER_CACHE_ENTRIES',8192,32768);
    if ($byteLimit===null||$entryLimit===null||is_link($dir)||!is_dir($dir)) return false;
    if ($target!==null&&($byteLimit===0||$entryLimit===0||strlen($bytes)>$byteLimit||!cm_cover_cache_name($name))) return false;
    $lockPath=$dir.DIRECTORY_SEPARATOR.'cache-admission.lock';
    clearstatcache(true,$lockPath);if (file_exists($lockPath)||is_link($lockPath)) {if (!cm_cover_cache_stat($lockPath)) return false;}
    $lock=cm_open_sidecar_lock($lockPath);if (!$lock) return false;
    try {
        // Busy or very expensive inventory => bypass the cache, not playback.
        if (!flock($lock,LOCK_EX|LOCK_NB)||!cm_regular_descriptor($lock,$lockPath)) return false;
        if ($target!==null) {clearstatcache(true,$target);if ((file_exists($target)||is_link($target))&&!cm_cover_cache_stat($target)) return false;}
        $deadline=hrtime(true)+75000000;$visited=0;$count=0;$size=0;$eligible=[];
        foreach (new FilesystemIterator($dir,FilesystemIterator::SKIP_DOTS) as $entry) {
            if (++$visited>32768||hrtime(true)>$deadline) return false;
            if (!cm_cover_cache_name($entry->getFilename())) continue;
            $file=$entry->getPathname();$s=cm_cover_cache_stat($file);if (!$s) continue;
            if ($entry->getFilename()===$name) continue; // replacement counted once
            $size+=$s['size'];$count++;$eligible[$file]=$s;
        }
        if ($target!==null) {$size+=strlen($bytes);$count++;}
        if ($size>$byteLimit||$count>$entryLimit) {
            uasort($eligible,fn($a,$b)=>$a['mtime']<=>$b['mtime']);
            foreach ($eligible as $file=>$before) {
                if ($size<=$byteLimit&&$count<=$entryLimit) break;
                if (hrtime(true)>$deadline||is_link($dir)) return false;
                $after=cm_cover_cache_stat($file);$same=$after!==null;
                if ($same) foreach (['dev','ino','mode','nlink','size','mtime','ctime'] as $k) if ($before[$k]!==$after[$k]) {$same=false;break;}
                if (!$same||!@unlink($file)) continue;
                $size-=$before['size'];$count--;
            }
        }
        if ($size>$byteLimit||$count>$entryLimit||is_link($dir)) return false;
        if ($target===null) return true;
        return !is_link($target)&&cm_replace_file($target,$bytes);
    } catch (Throwable $e) {return false;}
    finally {fclose($lock);}
}
