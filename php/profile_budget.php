<?php
require_once __DIR__.'/platform.php';
require_once __DIR__.'/durable_file.php';

// Optional aggregate admission for authoritative JSON and immutable artwork.
// This is a cooperating-writer admission policy, not an OS/filesystem quota.
// Control journals, SQL, downloads and external writers have separate budgets.
function cm_profile_limit(string $name,int $max): ?int {
    $raw=getenv($name);
    if ($raw===false||$raw==='') return null;
    $value=filter_var($raw,FILTER_VALIDATE_INT,['options'=>['min_range'=>0,'max_range'=>$max]]);
    if ($value===false) throw new RuntimeException('Invalid aggregate profile admission limit');
    return $value;
}
function cm_profile_canonical_equal(string $a,string $b): bool {
    return cachy_is_windows()?strcasecmp(str_replace('\\','/',$a),str_replace('\\','/',$b))===0:$a===$b;
}
// Refuse aliases and incomplete traversal; never follow directory links.
// Count apparent bytes, including old target and abandoned temporary files.
function cm_profile_usage(string $root,?int $maxBytes,?int $maxFiles,int $incoming): bool {
    $deadline=hrtime(true)+150000000;$visited=0;$bytes=$incoming;$files=1;
    if (($maxBytes!==null&&$bytes>$maxBytes)||($maxFiles!==null&&$files>$maxFiles)) return false;
    $dirs=[[$root,0]];
    while ($dirs) {
        [$dir,$depth]=array_pop($dirs);
        clearstatcache(true,$dir);
        $dirStat=@lstat($dir);
        if ($depth>32||hrtime(true)>$deadline||!$dirStat||($dirStat['mode']&0170000)!==0040000||!cm_profile_canonical_equal(realpath($dir)?:'', $dir)) return false;
        foreach (new FilesystemIterator($dir,FilesystemIterator::SKIP_DOTS) as $entry) {
            if (++$visited>100000||hrtime(true)>$deadline) return false;
            $path=$entry->getPathname();clearstatcache(true,$path);$stat=@lstat($path);
            if ($stat===false||$entry->isLink()) return false;
            $kind=$stat['mode']&0170000;
            if ($kind===0040000) {
                if (!cm_profile_canonical_equal(realpath($path)?:'', $path)) return false;
                $dirs[]=[$path,$depth+1];continue;
            }
            if (!cm_regular_stat($stat)||!is_int($stat['size'])||$stat['size']<0) return false;
            if ($stat['size']>PHP_INT_MAX-$bytes) return false;
            $bytes+=$stat['size'];$files++;
            if (($maxBytes!==null&&$bytes>$maxBytes)||($maxFiles!==null&&$files>$maxFiles)) return false;
        }
    }
    return hrtime(true)<=$deadline;
}
function cm_profile_replace_file(string $path,string $bytes,int $mode=0600): bool {
    try {
        $maxBytes=cm_profile_limit('CACHYMUSIC_PROFILE_MAX_BYTES',PHP_INT_MAX);
        $maxFiles=cm_profile_limit('CACHYMUSIC_PROFILE_MAX_FILES',100000);
        if ($maxBytes===null&&$maxFiles===null) return cm_replace_file($path,$bytes,$mode);
        $root=cachy_data_dir();$parent=realpath(dirname($path));
        if ($parent===false||!cm_profile_canonical_equal($parent,dirname($path))||!cachy_path_within($parent,$root)) return false;
        $lockPath=$root.DIRECTORY_SEPARATOR.'profile-admission.lock';
        $lock=cm_open_sidecar_lock($lockPath);if (!$lock) return false;
        try {
            if (!flock($lock,LOCK_EX|LOCK_NB)||!cm_regular_descriptor($lock,$lockPath)) return false;
            if (!cm_profile_usage($root,$maxBytes,$maxFiles,strlen($bytes))) return false;
            return cm_replace_file($path,$bytes,$mode);
        } finally {fclose($lock);}
    } catch (Throwable $e) {return false;}
}
