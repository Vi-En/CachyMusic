<?php
require_once __DIR__.'/platform.php';
// Shared authorization policy for media and record-associated data. A caller
// supplies the same authoritative snapshot used to resolve the track ID.
function cm_media_roots(array $snapshot, bool $mysql=false): array {
    $paths=[];
    $roots=[];
    foreach ([dirname(__DIR__),cachy_data_dir()] as $parent) {
        $base=realpath($parent); $child=$parent.DIRECTORY_SEPARATOR.'downloads'; $canonical=realpath($child);
        if ($base!==false&&$canonical!==false&&!is_link($child)&&is_dir($canonical)&&cachy_path_within($canonical,$base)) $roots[]=$canonical;
    }
    $directory=$mysql?Storage::getDefaultDirectory():($snapshot['default_directory']??'');
    $peer=$mysql?Storage::getSoulseekAccount():($snapshot['soulseek']??[]);
    $paths[]=$directory;
    foreach (['downloads_dir','shared_dir'] as $key) $paths[]=$peer[$key]??null;
    $home=cachy_home_dir();if ($home!=='') foreach (['/Music/Main','/Music','/Downloads'] as $sub) $paths[]=$home.$sub;
    foreach($paths as $path) {
        if (!is_string($path)||$path===''||str_contains($path,"\0")) continue;
        $canonical=realpath($path);
        if ($canonical!==false&&is_dir($canonical)&&cachy_is_allowed_scan_path($canonical)) $roots[]=$canonical;
    }
    return array_values(array_unique($roots));
}
function cm_media_path_allowed(string $real,array $roots): bool {
    // Canonical paths do not detect hard links. Refuse multiply linked media
    // consistently across streaming, metadata, indexing and artwork.
    clearstatcache(true,$real);$stat=@lstat($real);
    if (!$stat||($stat['mode']&0170000)!==0100000||$stat['nlink']!==1) return false;
    foreach($roots as $root) if(cachy_path_within($real,$root)) return true;
    return false;
}
function cm_media_record_path($row): ?string {
    if (!is_array($row)) return null;
    $path=($row['full_path']??'')?:($row['file_path']??'');
    return is_string($path)&&$path!==''&&!str_contains($path,"\0")?$path:null;
}

function cm_media_authority(array $snapshot): array {
    return [$snapshot['default_directory']??'',$snapshot['soulseek']['downloads_dir']??'',$snapshot['soulseek']['shared_dir']??''];
}
