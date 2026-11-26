<?php
// Stable sidecar lock: never follow a symbolic link or share a multiply
// linked inode. Compare the opened descriptor with the named file.
function cm_regular_stat(array|false $stat): bool {
    return $stat!==false && ($stat['mode']&0170000)===0100000 && $stat['nlink']===1;
}
function cm_regular_descriptor($handle,string $path): bool {
    clearstatcache(true,$path);$named=@lstat($path);$opened=@fstat($handle);
    return cm_regular_stat($named)&&cm_regular_stat($opened)&&$named['dev']===$opened['dev']&&$named['ino']===$opened['ino'];
}
// Bounded read from the validated descriptor, never an unchecked second open.
function cm_read_regular_file(string $path,int $limit): string|false {
    clearstatcache(true,$path);$named=@lstat($path);
    if ($limit<0||$limit>=PHP_INT_MAX||!cm_regular_stat($named)||$named['size']>$limit) return false;
    $h=@fopen($path,'rb');if (!$h) return false;
    try {
        $opened=@fstat($h);
        if (!cm_regular_descriptor($h,$path)||!$opened||$opened['size']>$limit) return false;
        $raw=stream_get_contents($h,$limit+1);
        return is_string($raw)&&strlen($raw)<=$limit&&cm_regular_descriptor($h,$path)?$raw:false;
    } finally {fclose($h);}
}
function cm_open_sidecar_lock(string $path) {
    clearstatcache(true,$path);$before=@lstat($path);
    if ($before!==false&&!cm_regular_stat($before)) return false;
    $handle=@fopen($path,DIRECTORY_SEPARATOR==='\\'?'c+':'c+e');
    if (!$handle) return false;
    if (!cm_regular_descriptor($handle,$path)) {fclose($handle);return false;}
    return $handle;
}
// Same-directory replacement: flush and sync file contents before publishing.
// A post-rename directory sync is best effort: failure cannot undo publication.
function cm_sync_directory(string $dir): void {
    if (DIRECTORY_SEPARATOR === '\\' || !function_exists('fsync')) return;
    $handle = @fopen($dir, 'r');
    if ($handle !== false) {
        try { @fsync($handle); } finally { fclose($handle); }
    }
}
function cm_replace_file(string $path, string $bytes, int $mode = 0600, ?array &$published = null): bool {
    $published=null;
    $dir = dirname($path);
    $tmp = @tempnam($dir, '.cm-write-');
    if ($tmp === false) return false;
    try {
        // tempnam may fall back to the system temp directory on failure.
        if (realpath(dirname($tmp)) !== realpath($dir)) return false;
        $handle = @fopen($tmp, 'wb');
        if ($handle === false) return false;
        try {
            $len = strlen($bytes);
            for ($offset = 0; $offset < $len;) {
                $n = @fwrite($handle, substr($bytes, $offset, 1048576));
                if ($n === false || $n === 0) return false;
                $offset += $n;
            }
            if (!@fflush($handle) || !function_exists('fsync') || !@fsync($handle)) return false;
            $st=@fstat($handle);
        } finally { fclose($handle); }
        if (DIRECTORY_SEPARATOR !== '\\' && !@chmod($tmp, $mode)) return false;
        if (!@rename($tmp, $path)) return false;
        cm_sync_directory($dir);
        $published=is_array($st)?$st:null;
        return true;
    } finally { if (is_file($tmp)) @unlink($tmp); }
}
