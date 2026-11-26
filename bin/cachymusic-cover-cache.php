<?php
// Offline inspection and explicit eviction of only recognized disposable covers.
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require_once __DIR__ . '/../php/platform.php';
require_once __DIR__ . '/../php/cover_cache_budget.php';
function cache_fail(string $msg): never { fwrite(STDERR,$msg.PHP_EOL); exit(1); }
function cache_regular(string $path): ?array {
    clearstatcache(true,$path); $s=@lstat($path);
    return $s && ($s['mode'] & 0170000)===0100000 && $s['nlink']===1 ? $s : null;
}
if (($argv[1]??'')!=='--cache-dir' || !isset($argv[2]) || !in_array(count($argv),[3,5],true) || (count($argv)===5 && ($argv[3]!=='--prune-to-bytes' || !preg_match('/^(0|[1-9][0-9]*)$/D',$argv[4]) || filter_var($argv[4],FILTER_VALIDATE_INT)===false))) {
    fwrite(STDERR,"Usage: php bin/cachymusic-cover-cache.php --cache-dir PATH [--prune-to-bytes BYTES]\nStop all backends and back up the profile before pruning. Default: inspection only.\n");exit(2);
}
$target=isset($argv[4])?(int)$argv[4]:null;
$root=realpath($argv[2]);
if ($root===false || !is_dir($root) || is_link($argv[2])) cache_fail('Existing non-aliased cache directory required.');
$dir=$root.DIRECTORY_SEPARATOR.'covers';
if (is_link($dir) || !is_dir($dir)) cache_fail('Existing non-aliased covers directory required.');
$report=['inspection_only'=>$target===null,'target_recognized_bytes'=>$target,'minimum_age_seconds'=>604800,'recognized_entries'=>0,'recognized_bytes_before'=>0,'recognized_bytes_after'=>0,'unknown_or_unsafe_entries'=>0,'young_entries'=>0,'removed_entries'=>0,'removed_bytes'=>0,'failed_entries'=>0];
$eligible=[];$now=time();
try {
    foreach (new FilesystemIterator($dir, FilesystemIterator::SKIP_DOTS) as $entry) {
        $name=$entry->getFilename();$path=$entry->getPathname();
        // Do not touch legacy tid_* files, uncommitted stages or authoritative artwork.
        if (!cm_cover_cache_name($name) || !($stat=cache_regular($path))) { $report['unknown_or_unsafe_entries']++;continue; }
        $report['recognized_entries']++;$report['recognized_bytes_before']+=$stat['size'];
        if ($stat['mtime']>$now-604800) { $report['young_entries']++;continue; }
        if ($target!==null) $eligible[$path]=$stat;
    }
    $report['recognized_bytes_after']=$report['recognized_bytes_before'];
    if ($target!==null) {
        uasort($eligible,fn($a,$b)=>$a['mtime']<=>$b['mtime']);
        foreach ($eligible as $path=>$before) {
            if ($report['recognized_bytes_after']<=$target) break;
            $after=cache_regular($path);$same=$after!==null;
            if ($same) foreach (['dev','ino','mode','nlink','size','mtime','ctime'] as $key) if ($before[$key]!==$after[$key]) {$same=false;break;}
            if (!$same || is_link($dir) || !@unlink($path)) { $report['failed_entries']++;continue; }
            $report['removed_entries']++;$report['removed_bytes']+=$before['size'];$report['recognized_bytes_after']-=$before['size'];
        }
    }
    $report['target_met']=$target===null?null:$report['recognized_bytes_after']<=$target;
    echo json_encode($report,JSON_PRETTY_PRINT|JSON_THROW_ON_ERROR).PHP_EOL;
    exit($report['failed_entries']?1:($report['target_met']===false?3:0));
} catch(Throwable $e) {cache_fail('Cover cache maintenance failed; inspect the report and remaining cache before retrying.');}
