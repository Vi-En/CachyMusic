<?php
require_once __DIR__.'/platform.php';
require_once __DIR__.'/durable_file.php';
// A bounded profile-local path lock survives atomic file replacement. Existing
// inode locks also protect POSIX aliases. Locks cover requests, not idle playback.
function cm_recording_key(string $real): string {
    $key=cachy_normalize_path($real);if (cachy_is_windows()) $key=strtolower($key);
    return hash('sha256',$key);
}
function cm_recording_lock(string $real,bool $exclusive) {
    $path=cachy_data_dir().DIRECTORY_SEPARATOR.'recording-'.substr(cm_recording_key($real),0,3).'.lock';
    $h=cm_open_sidecar_lock($path);if (!$h) return false;
    if (!flock($h,($exclusive?LOCK_EX:LOCK_SH)|LOCK_NB)||!cm_regular_descriptor($h,$path)) {fclose($h);return false;}
    return $h;
}
